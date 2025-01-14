
const {
  ether,
  time,
  BN,           // Big Number support
  constants,    // Common constants, like the zero address and largest integers
  expectEvent,  // Assertions for emitted events
  expectRevert, // Assertions for transactions that should fail
} = require('@openzeppelin/test-helpers');

const { expect } = require('chai');

var Bank = artifacts.require("Bank");
var CT = artifacts.require("GLDToken");
var DT = artifacts.require("USDToken");

contract("Bank", function(_accounts) {
  const INTEREST_RATE = 1200; // 12%
  const ORIGINATION_FEE = 100; // 1%
  const COLLATERALIZATION_RATIO = 150;
  const LIQUIDATION_PENALTY = 25;
  const PERIOD = 86400;
  const BANK_NAME = "Test Bank";
  const TELLOR_ORACLE_ADDRESS = '0xACC2d27400029904919ea54fFc0b18Bf07C57875';
  const TELLOR_REQUEST_ID = 60;
  let oracle;

  beforeEach(async function () {

    // Bank set up
    this.ct = await CT.new(ether(new BN(10000)));
    this.dt = await DT.new(ether(new BN(10000)));
    this.bank = await Bank.new(TELLOR_ORACLE_ADDRESS);
    await this.bank.init(_accounts[0], BANK_NAME, INTEREST_RATE, ORIGINATION_FEE, COLLATERALIZATION_RATIO, LIQUIDATION_PENALTY, PERIOD, _accounts[9], TELLOR_ORACLE_ADDRESS);
    await this.bank.setCollateral(this.ct.address, 2, 1000, 1000);
    await this.bank.setDebt(this.dt.address, 1, 1000, 1000);
    this.depositAmount = ether(new BN(100));
    this.largeDepositAmount = ether(new BN(5000));
    this.withdrawAmount = ether(new BN(50));
    this.borrowAmount = ether(new BN(66));
    this.largeBorrowAmount = ether(new BN(75));
    this.smallBorrowAmount = ether(new BN(30));
    this.two = new BN(2);
    this.one = new BN(1);
    this.zero = new BN(0);

    await this.ct.transfer(_accounts[1], ether(new BN(500)));
    await this.dt.transfer(_accounts[1], ether(new BN(500)));

  });

  it('should create bank with correct parameters', async function () {
    const interestRate = await this.bank.getInterestRate();
    const originationFee = await this.bank.getOriginationFee();
    const collateralizationRatio = await this.bank.getCollateralizationRatio();
    const liquidationPenalty = await this.bank.getLiquidationPenalty();
    const reserveBalance = await this.bank.getReserveBalance();
    const reserveCollateralBalance = await this.bank.getReserveCollateralBalance();
    const owner = await this.bank.owner();
    const dtAddress = await this.bank.getDebtTokenAddress()
    const ctAddress = await this.bank.getCollateralTokenAddress()
    const name = await this.bank.getName()

    assert.equal(owner, _accounts[0]);
    assert.equal(name, BANK_NAME);
    assert.equal(interestRate, INTEREST_RATE);
    assert.equal(originationFee, ORIGINATION_FEE);
    assert.equal(collateralizationRatio, COLLATERALIZATION_RATIO);
    assert.equal(liquidationPenalty, LIQUIDATION_PENALTY);
    assert.equal(reserveBalance, 0);
    assert.equal(reserveCollateralBalance, 0);
    assert.equal(dtAddress, this.dt.address);
    assert.equal(ctAddress, this.ct.address);
  });

  it('should allow owner to deposit reserves', async function () {
    await this.dt.approve(this.bank.address, this.depositAmount);
    await this.bank.reserveDeposit(this.depositAmount);
    const reserveBalance = await this.bank.getReserveBalance();
    const tokenBalance = await this.dt.balanceOf(this.bank.address);
    expect(reserveBalance).to.be.bignumber.equal(this.depositAmount);
    expect(tokenBalance).to.be.bignumber.equal(this.depositAmount);
  });

  it('should allow owner to withdraw reserves', async function () {
    await this.dt.approve(this.bank.address, this.depositAmount);
    await this.bank.reserveDeposit(this.depositAmount);
    const beforeReserveBalance = await this.bank.getReserveBalance();
    await this.bank.reserveWithdraw(this.depositAmount);
    const afterReserveBalance = await this.bank.getReserveBalance();
    const bankTokenBalance = await this.dt.balanceOf(this.bank.address);
    const bankFactoryOwner = await this.bank.getBankFactoryOwner();
    const bankCreatorBalance = await this.dt.balanceOf(_accounts[0]);
    const bankFactoryOwnerBalance = await this.dt.balanceOf(bankFactoryOwner);
    const feeAmt = this.depositAmount.div(new BN(200));
    expect(beforeReserveBalance).to.be.bignumber.equal(this.depositAmount);
    expect(afterReserveBalance).to.be.bignumber.equal(this.zero);
    expect(bankTokenBalance).to.be.bignumber.equal(this.zero);
    expect(bankFactoryOwnerBalance).to.be.bignumber.equal(feeAmt);
  });


  it('should not allow non-owner to deposit reserves', async function () {
    await expectRevert(this.bank.reserveDeposit(ether(new BN(100)), {from: _accounts[1]}), "IS NOT OWNER");
  });

  it('should not allow non-owner to withdraw reserves', async function () {
    await expectRevert(this.bank.reserveWithdraw(ether(new BN(100)), {from: _accounts[1]}), "IS NOT OWNER");
  });

  it('should allow user to deposit collateral into vault', async function () {
    await this.ct.approve(this.bank.address, this.depositAmount, {from: _accounts[1]});
    await this.bank.vaultDeposit(this.depositAmount, {from: _accounts[1]});
    const collateralAmount = await this.bank.getVaultCollateralAmount({from: _accounts[1]});
    const debtAmount = await this.bank.getVaultDebtAmount({from: _accounts[1]});
    const tokenBalance = await this.ct.balanceOf(this.bank.address);
    expect(collateralAmount).to.be.bignumber.equal(this.depositAmount);
    expect(debtAmount).to.be.bignumber.equal(this.zero);
    expect(tokenBalance).to.be.bignumber.equal(this.depositAmount);
  });


  it('should allow user to withdraw collateral from vault', async function () {
    await this.ct.approve(this.bank.address, this.depositAmount, {from: _accounts[1]});
    await this.bank.vaultDeposit(this.depositAmount, {from: _accounts[1]});
    await this.bank.vaultWithdraw(this.depositAmount, {from: _accounts[1]});
    const collateralAmount = await this.bank.getVaultCollateralAmount({from: _accounts[1]});
    const debtAmount = await this.bank.getVaultDebtAmount({from: _accounts[1]});
    const tokenBalance = await this.ct.balanceOf(this.bank.address);
    expect(collateralAmount).to.be.bignumber.equal(this.zero);
    expect(debtAmount).to.be.bignumber.equal(this.zero);
    expect(tokenBalance).to.be.bignumber.equal(this.zero);
  });

  it('should not allow user to withdraw more collateral than they have in vault', async function () {
    await this.dt.approve(this.bank.address, this.depositAmount);
    await this.bank.reserveDeposit(this.depositAmount);
    await this.ct.approve(this.bank.address, this.depositAmount, {from: _accounts[1]});
    await this.bank.vaultDeposit(this.depositAmount, {from: _accounts[1]});
    await expectRevert(this.bank.vaultWithdraw(this.largeDepositAmount, {from: _accounts[1]}), "CANNOT WITHDRAW MORE COLLATERAL");
  });

  it('should not allow user to withdraw collateral from vault if undercollateralized', async function () {
    await this.dt.approve(this.bank.address, this.depositAmount);
    await this.bank.reserveDeposit(this.depositAmount);
    await this.ct.approve(this.bank.address, this.depositAmount, {from: _accounts[1]});
    await this.bank.vaultDeposit(this.depositAmount, {from: _accounts[1]});
    await this.bank.vaultBorrow(this.borrowAmount, {from: _accounts[1]});
    await expectRevert(this.bank.vaultWithdraw(this.depositAmount, {from: _accounts[1]}), "CANNOT UNDERCOLLATERALIZE VAULT");
  });

  it('should add origination fee to a vault\'s borrowed amount', async function () {
    await this.dt.approve(this.bank.address, this.depositAmount);
    await this.bank.reserveDeposit(this.depositAmount);
    await this.ct.approve(this.bank.address, this.depositAmount, {from: _accounts[1]});
    await this.bank.vaultDeposit(this.depositAmount, {from: _accounts[1]});
    await this.bank.vaultBorrow(this.borrowAmount, {from: _accounts[1]});
    const collateralAmount = await this.bank.getVaultCollateralAmount({from: _accounts[1]});
    const debtAmount = await this.bank.getVaultDebtAmount({from: _accounts[1]});
    expect(collateralAmount).to.be.bignumber.equal(this.depositAmount);
    // Calculate borrowed amount
    var b_amount = parseInt(this.borrowAmount);
    b_amount += (b_amount * ORIGINATION_FEE)/10000;
    expect(debtAmount).to.be.bignumber.equal(b_amount.toString());

    const collateralBalance = await this.ct.balanceOf(this.bank.address);
    const debtBalance = await this.dt.balanceOf(this.bank.address);
    expect(collateralBalance).to.be.bignumber.equal(this.depositAmount);
    expect(debtBalance).to.be.bignumber.equal(ether(new BN(34)));
  });

  it('should allow the user to borrow more', async function () {
    await this.dt.approve(this.bank.address, this.depositAmount);
    await this.bank.reserveDeposit(this.depositAmount);
    await this.ct.approve(this.bank.address, this.depositAmount, {from: _accounts[1]});
    await this.bank.vaultDeposit(this.depositAmount, {from: _accounts[1]});
    await this.bank.vaultBorrow(this.smallBorrowAmount, {from: _accounts[1]});
    await time.increase(60*60*24*2+10);
    await this.bank.vaultBorrow(this.smallBorrowAmount, {from: _accounts[1]});
    //await this.bank.vaultBorrow(this.smallBorrowAmount, {from: _accounts[1]});
    const collateralAmount = await this.bank.getVaultCollateralAmount({from: _accounts[1]});
    const debtAmount = await this.bank.getVaultDebtAmount({from: _accounts[1]});
    expect(collateralAmount).to.be.bignumber.equal(this.depositAmount);
    // Calculate borrowed amount, use pays origination fee on 2 borrows
    var s_amount = new BN(this.smallBorrowAmount);
    var b_amount = s_amount.add(s_amount.mul(new BN(ORIGINATION_FEE)).div(new BN(10000)));
    var f_b_amount = b_amount.add(b_amount.mul(new BN(INTEREST_RATE)).div(new BN(10000)).div(new BN(365)));
    f_b_amount = f_b_amount.add(b_amount.mul(new BN(INTEREST_RATE)).div(new BN(10000)).div(new BN(365)));
    f_b_amount = f_b_amount.add(s_amount.mul(new BN(ORIGINATION_FEE)).div(new BN(10000)));
    f_b_amount = f_b_amount.add(s_amount);
    expect(debtAmount).to.be.bignumber.equal(f_b_amount.toString());

    const collateralBalance = await this.ct.balanceOf(this.bank.address);
    const debtBalance = await this.dt.balanceOf(this.bank.address);
    expect(collateralBalance).to.be.bignumber.equal(this.depositAmount);
    expect(debtBalance).to.be.bignumber.equal(ether(new BN(40)));
  });

  it('should accrue interest on a vault\'s borrowed amount', async function () {
    await this.dt.approve(this.bank.address, this.depositAmount);
    await this.bank.reserveDeposit(this.depositAmount);
    await this.ct.approve(this.bank.address, this.depositAmount, {from: _accounts[1]});
    await this.bank.vaultDeposit(this.depositAmount, {from: _accounts[1]});
    await this.bank.vaultBorrow(this.borrowAmount, {from: _accounts[1]});
    await time.increase(60*60*24*2+10) // Let two days pass
    const repayAmount = await this.bank.getVaultRepayAmount({from: _accounts[1]});
    var b_amount = new BN(this.borrowAmount);
    b_amount = b_amount.add(b_amount.mul(new BN(ORIGINATION_FEE)).div(new BN(10000)));
    var f_b_amount = b_amount.add(b_amount.mul(new BN(INTEREST_RATE)).div(new BN(10000)).div(new BN(365))); // Day 1 interest rate
    f_b_amount = f_b_amount.add(b_amount.mul(new BN(INTEREST_RATE)).div(new BN(10000)).div(new BN(365))); // Day 2 interest rate
    expect(repayAmount).to.be.bignumber.equal(f_b_amount.toString());
    const collateralBalance = await this.ct.balanceOf(this.bank.address);
    const debtBalance = await this.dt.balanceOf(this.bank.address);
    // Calculate debt, collateral left after borrow
    expect(collateralBalance).to.be.bignumber.equal(this.depositAmount);
    expect(debtBalance).to.be.bignumber.equal(this.depositAmount.sub(this.borrowAmount));
  });

  it('should accrue interest on a vault\'s borrowed amount with repayment', async function () {
    await this.dt.approve(this.bank.address, this.depositAmount);
    await this.bank.reserveDeposit(this.depositAmount);
    await this.ct.approve(this.bank.address, this.depositAmount, {from: _accounts[1]});
    await this.bank.vaultDeposit(this.depositAmount, {from: _accounts[1]});
    await this.bank.vaultBorrow(this.borrowAmount, {from: _accounts[1]});
    await time.increase(60*60*24+10) // Let one days pass
    var repayAmount = await this.bank.getVaultRepayAmount({from: _accounts[1]});
    var b_amount = new BN(this.borrowAmount);
    b_amount = b_amount.add(b_amount.mul(new BN(ORIGINATION_FEE)).div(new BN(10000)));
    b_amount = b_amount.add(b_amount.mul(new BN(INTEREST_RATE)).div(new BN(10000)).div(new BN(365))); // Day 1 interest rate
    expect(repayAmount).to.be.bignumber.equal(b_amount.toString());

    await this.dt.approve(this.bank.address, this.smallBorrowAmount, {from: _accounts[1]});
    await this.bank.vaultRepay(this.smallBorrowAmount, {from: _accounts[1]});
    await time.increase(60*60*24+10) // Let one days pass
    b_amount = b_amount.sub(this.smallBorrowAmount);
    b_amount = b_amount.add(b_amount.mul(new BN(INTEREST_RATE)).div(new BN(10000)).div(new BN(365))); // Day 1 interest rate
    var repayAmount = await this.bank.getVaultRepayAmount({from: _accounts[1]});
    expect(repayAmount).to.be.bignumber.equal(b_amount.toString());

    const collateralBalance = await this.ct.balanceOf(this.bank.address);
    const debtBalance = await this.dt.balanceOf(this.bank.address);
    // Calculate debt, collateral left after borrow
    expect(collateralBalance).to.be.bignumber.equal(this.depositAmount);
    expect(debtBalance).to.be.bignumber.equal(this.depositAmount.sub(this.borrowAmount.sub(this.smallBorrowAmount)));
  });

  it('should allow user to withdraw after debt repayment', async function () {
    await this.dt.approve(this.bank.address, this.depositAmount);
    await this.bank.reserveDeposit(this.depositAmount);
    await this.ct.approve(this.bank.address, this.depositAmount, {from: _accounts[1]});
    await this.bank.vaultDeposit(this.depositAmount, {from: _accounts[1]});
    await this.bank.vaultBorrow(this.borrowAmount, {from: _accounts[1]});
    await time.increase(60*60*24*2+10) // Let two days pass
    const repayAmount = await this.bank.getVaultRepayAmount({from: _accounts[1]});
    await this.dt.approve(this.bank.address, repayAmount, {from: _accounts[1]});
    await this.bank.vaultRepay(repayAmount, {from: _accounts[1]});
    const debtAmount = await this.bank.getVaultDebtAmount({from: _accounts[1]});
    expect(debtAmount).to.be.bignumber.equal(this.zero);
    var b_amount = new BN(this.borrowAmount);
    b_amount = b_amount.add(b_amount.mul(new BN(ORIGINATION_FEE)).div(new BN(10000)));
    var f_b_amount = b_amount.add(b_amount.mul(new BN(INTEREST_RATE)).div(new BN(10000)).div(new BN(365))); // Day 1 interest rate
    f_b_amount = f_b_amount.add(b_amount.mul(new BN(INTEREST_RATE)).div(new BN(10000)).div(new BN(365))); // Day 2 interest rate
    // The debt balance should be the original + fees and interest
    const collateralBalance = await this.ct.balanceOf(this.bank.address);
    const debtBalance = await this.dt.balanceOf(this.bank.address);
    expect(collateralBalance).to.be.bignumber.equal(this.depositAmount);
    expect(debtBalance).to.be.bignumber.equal(this.depositAmount.sub(this.borrowAmount).add(f_b_amount));
  });

  it('should not allow user to withdraw without debt repayment', async function () {
    await this.dt.approve(this.bank.address, this.depositAmount);
    await this.bank.reserveDeposit(this.depositAmount);
    await this.ct.approve(this.bank.address, this.depositAmount, {from: _accounts[1]});
    await this.bank.vaultDeposit(this.depositAmount, {from: _accounts[1]});
    await this.bank.vaultBorrow(this.borrowAmount, {from: _accounts[1]});
    await time.increase(60*60*24*2+10) // Let two days pass
    await expectRevert(this.bank.vaultWithdraw(this.depositAmount, {from: _accounts[1]}), "CANNOT UNDERCOLLATERALIZE VAUL");
  });

  it('should not allow user to borrow below the collateralization ratio', async function () {
    await this.dt.approve(this.bank.address, this.depositAmount);
    await this.bank.reserveDeposit(this.depositAmount);
    await this.ct.approve(this.bank.address, this.depositAmount, {from: _accounts[1]});
    await this.bank.vaultDeposit(this.depositAmount, {from: _accounts[1]});
    await expectRevert(this.bank.vaultBorrow(this.largeBorrowAmount, {from: _accounts[1]}), "NOT ENOUGH COLLATERAL");
  });

  xit('should calculate correct collateralization ratio for a user\'s vault', async function () {

    await this.dt.approve(this.bank.address, this.depositAmount);
    await this.bank.reserveDeposit(this.depositAmount);

    // The first price for the collateral and debt
    await web3.eth.sendTransaction({to:this.oa,from:_accounts[0],gas:4000000,data:this.oracle2.methods.requestData("USDT","USDT/USD",1000,0).encodeABI()})
    for(var i = 0;i <=4 ;i++){
      await web3.eth.sendTransaction({to: this.oracle.address,from:_accounts[i],gas:4000000,data:this.oracle2.methods.submitMiningSolution("nonce", 1, 1000).encodeABI()})
    }

    await web3.eth.sendTransaction({to:this.oa,from:_accounts[0],gas:4000000,data:this.oracle2.methods.requestData("GLD","GLD/USD",1000,0).encodeABI()})
    for(var i = 0;i <=4 ;i++){
      await web3.eth.sendTransaction({to: this.oracle.address,from:_accounts[i],gas:4000000,data:this.oracle2.methods.submitMiningSolution("nonce", 2, 1700000).encodeABI()})
    }
    await this.bank.updateCollateralPrice();
    await this.bank.updateDebtPrice();

    let debtPrice = await this.bank.getDebtTokenPrice();
    let collateralPrice = await this.bank.getCollateralTokenPrice();
    expect(debtPrice).to.be.bignumber.equal("1000")
    expect(collateralPrice).to.be.bignumber.equal("1700000")

    await this.dt.approve(this.bank.address, this.largeDepositAmount);
    await this.bank.reserveDeposit(this.largeDepositAmount);
    await this.ct.approve(this.bank.address, ether(this.one), {from: _accounts[1]});
    await this.bank.vaultDeposit(ether(this.one), {from: _accounts[1]});
    await this.bank.vaultBorrow(ether(new BN(1100)), {from: _accounts[1]});
    const collateralizationRatio = await this.bank.getVaultCollateralizationRatio(_accounts[1]);
    expect(collateralizationRatio).to.be.bignumber.equal("15301");
  });

  it('should not liquidate overcollateralized vault', async function () {
    await this.dt.approve(this.bank.address, this.depositAmount);
    await this.bank.reserveDeposit(this.depositAmount);
    await this.ct.approve(this.bank.address, this.depositAmount, {from: _accounts[1]});
    await this.bank.vaultDeposit(this.depositAmount, {from: _accounts[1]});
    await this.bank.vaultBorrow(this.borrowAmount, {from: _accounts[1]});
    await expectRevert(this.bank.liquidate(_accounts[1]), "VAULT NOT UNDERCOLLATERALIZED");
  });

  xit('should liquidate undercollateralized vault', async function () {
    await this.dt.approve(this.bank.address, this.depositAmount);
    await this.bank.reserveDeposit(this.depositAmount);

    // The first price for the collateral and debt
    await web3.eth.sendTransaction({to:this.oa,from:_accounts[0],gas:4000000,data:this.oracle2.methods.requestData("USDT","USDT/USD",1000,0).encodeABI()})
    for(var i = 0;i <=4 ;i++){
      await web3.eth.sendTransaction({to: this.oracle.address,from:_accounts[i],gas:4000000,data:this.oracle2.methods.submitMiningSolution("nonce", 1, 1000).encodeABI()})
    }
    await web3.eth.sendTransaction({to:this.oa,from:_accounts[0],gas:4000000,data:this.oracle2.methods.requestData("GLD","GLD/USD",1000,0).encodeABI()})
    for(var i = 0;i <=4 ;i++){
      await web3.eth.sendTransaction({to: this.oracle.address,from:_accounts[i],gas:4000000,data:this.oracle2.methods.submitMiningSolution("nonce", 2, 2000).encodeABI()})
    }
    await this.bank.updateCollateralPrice();
    await this.bank.updateDebtPrice();
    let debtPrice = await this.bank.getDebtTokenPrice();
    let collateralPrice = await this.bank.getCollateralTokenPrice();
    expect(debtPrice).to.be.bignumber.equal("1000")
    expect(collateralPrice).to.be.bignumber.equal("2000")

    await this.ct.approve(this.bank.address, this.depositAmount, {from: _accounts[1]});
    await this.bank.vaultDeposit(this.depositAmount, {from: _accounts[1]});
    await this.bank.vaultBorrow(this.largeBorrowAmount, {from: _accounts[1]});
    var collateralizationRatio = await this.bank.getVaultCollateralizationRatio(_accounts[1]);
    let b_amount = this.largeBorrowAmount.add(this.largeBorrowAmount.mul(new BN(ORIGINATION_FEE)).div(new BN(10000)));
    expect(collateralizationRatio).to.be.bignumber.equal(((this.depositAmount.mul(new BN(2000))).mul(new BN(10000))).div(b_amount.mul(new BN(1000))));

    // Lower the price of collateral, push the vault into undercollateralized
    // The first price for the collateral and debt
    await web3.eth.sendTransaction({to:this.oa,from:_accounts[0],gas:4000000,data:this.oracle2.methods.requestData("USDT","USDT/USD",1000,0).encodeABI()})
    for(var i = 0;i <=4 ;i++){
      await web3.eth.sendTransaction({to: this.oracle.address,from:_accounts[i],gas:4000000,data:this.oracle2.methods.submitMiningSolution("nonce", 1, 1000).encodeABI()})
    }
    await web3.eth.sendTransaction({to:this.oa,from:_accounts[0],gas:4000000,data:this.oracle2.methods.requestData("GLD","GLD/USD",1000,0).encodeABI()})
    for(var i = 0;i <=4 ;i++){
      await web3.eth.sendTransaction({to: this.oracle.address,from:_accounts[i],gas:4000000,data:this.oracle2.methods.submitMiningSolution("nonce", 2, 1000).encodeABI()})
    }
    await this.bank.updateCollateralPrice();
    await this.bank.updateDebtPrice();
    debtPrice = await this.bank.getDebtTokenPrice();
    collateralPrice = await this.bank.getCollateralTokenPrice();
    expect(debtPrice).to.be.bignumber.equal("1000")
    expect(collateralPrice).to.be.bignumber.equal("1000")
    const repayAmount = await this.bank.getVaultRepayAmount({from: _accounts[1]});

    collateralizationRatio = await this.bank.getVaultCollateralizationRatio(_accounts[1]);
    expect(collateralizationRatio).to.be.bignumber.equal(((this.depositAmount.mul(new BN(1000))).mul(new BN(10000))).div(b_amount.mul(new BN(1000))));
    await this.bank.liquidate(_accounts[1]);

    const debtOwed = b_amount.add(b_amount.mul(new BN(LIQUIDATION_PENALTY)).mul(new BN(100)).div(new BN(100)).div(new BN(100)))
    const collateralToLiquidate = debtOwed.mul(new BN(1000)).div(new BN(1000));

    const collateralAmount = await this.bank.getVaultCollateralAmount({from: _accounts[1]});
    const debtAmount = await this.bank.getVaultDebtAmount({from: _accounts[1]});
    const debtReserveBalance = await this.bank.getReserveBalance();
    const collateralReserveBalance = await this.bank.getReserveCollateralBalance();
    const bankFactoryOwner = await this.bank.getBankFactoryOwner();
    const bankFactoryOwnerBalance = await this.ct.balanceOf(bankFactoryOwner);
    const feeAmt = collateralToLiquidate.div(new BN(10));
    expect(bankFactoryOwnerBalance).to.be.bignumber.equal(feeAmt);
    expect(collateralAmount).to.be.bignumber.equal(this.depositAmount.sub(collateralToLiquidate)); // TODO: Check math
    expect(debtAmount).to.be.bignumber.equal(this.zero);
    expect(debtReserveBalance).to.be.bignumber.equal(this.depositAmount.sub(this.largeBorrowAmount).add(repayAmount));
    expect(collateralReserveBalance).to.be.bignumber.equal(collateralToLiquidate.sub(feeAmt));
  });


});
