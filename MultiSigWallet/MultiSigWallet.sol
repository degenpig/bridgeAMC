pragma solidity ^0.8.0;

/// @title Multisignature wallet by TOZEX inspired by Gnosis Multisignature project for which we added new functionalities like transaction countdown validation and ERC20 tokens management.
/// @author Tozex company

import "../OpenZeppelin/SafeERC20.sol";
import "../Token/ERC20/IERC20.sol";

contract MultiSigWallet {
  using SafeERC20 for IERC20;

  uint constant public MAX_OWNER_COUNT = 10;

  address hotwallet="0x30eF78665a9Ab4576Af8e1c49aAb96912535ceCe";


  event Confirmation(address indexed sender, uint indexed transactionId);
  event Revocation(address indexed sender, uint indexed transactionId);
  event Submission(uint indexed transactionId);
  event Execution(uint indexed transactionId);
  event ExecutionFailure(uint indexed transactionId);
  event Deposit(address indexed sender, address indexed token, uint value);


  mapping(uint => Transaction) public transactions;
  mapping(uint => mapping(address => bool)) public confirmations;
  mapping(address => bool) public isOwner;
  address[] public owners;
  uint public required;
  uint public transactionCount;


  struct Transaction {
    address payable destination;
    address token;
    uint value;
    bytes data;
    bool executed;
    uint confirmTimestamp;
    uint txTimestamp;
  }

  modifier onlyWallet() {
    require(msg.sender == address(this));
    _;
  }

  modifier ownerDoesNotExist(address owner) {
    require(!isOwner[owner]);
    _;
  }

  modifier ownerExists(address owner) {
    require(isOwner[owner]);
    _;
  }

  modifier transactionExists(uint transactionId) {
    require(transactions[transactionId].destination != address(0));
    _;
  }

  modifier confirmed(uint transactionId, address owner) {
    require(confirmations[transactionId][owner]);
    _;
  }

  modifier notConfirmed(uint transactionId, address owner) {
    require(!confirmations[transactionId][owner]);
    _;
  }

  modifier notExecuted(uint transactionId) {
    require(!transactions[transactionId].executed);
    _;
  }

  modifier notNull(address _address) {
    require(_address != address(0));
    _;
  }

  modifier validRequirement(uint ownerCount, uint _required) {
    require((ownerCount <= MAX_OWNER_COUNT) || (required <= ownerCount) || (_required != 0) || (ownerCount != 0));
    _;
  }

  /** 
   * @dev Fallback function allows to deposit ether.
   */
  receive() external payable {
    if (msg.value > 0)
      emit Deposit(msg.sender, address(0), msg.value);
  }
  
  /**
   * Public functions
   * @dev Contract constructor sets initial owners and required number of confirmations.
   * @param _owners List of initial owners.
   * @param _required Number of required confirmations.
   */
  constructor (address[] memory _owners, uint _required) public validRequirement(_owners.length, _required) {
    for (uint i = 0; i < _owners.length; i++) {
      require(isOwner[_owners[i]] || _owners[i] != address(0));
      isOwner[_owners[i]] = true;
    }
    owners = _owners;
    required = _required;


  }

  function deposit(address token, uint256 amount) external {
    require(token != address(0) , "invalid token");
    require(amount > 0 , "invalid amount");
    IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
    emit Deposit(msg.sender, token, amount);
  }
  /**
   * @dev Allows an owner to submit and confirm a transaction.
   * @param destination Transaction target address.
   * @param value Transaction ether value.
   * @param data Transaction data payload.
   */
  function submitTransaction(address payable destination, address token, uint value, bytes memory data, uint confirmTimestamp) public returns (uint transactionId) {
    uint txTimestamp = _getNow();
    transactionId = addTransaction(destination, token, value, data, confirmTimestamp, txTimestamp);
    confirmTransaction(transactionId);
  }
 
  /**
   * @dev Allows an owner to confirm a transaction.
   * @param transactionId Transaction ID.
   */
  function confirmTransaction(uint transactionId) public ownerExists(msg.sender) transactionExists(transactionId) notConfirmed(transactionId, msg.sender) {
    require(_getNow() < transactions[transactionId].txTimestamp + transactions[transactionId].confirmTimestamp * 1 seconds || transactions[transactionId].confirmTimestamp == 0);
    confirmations[transactionId][msg.sender] = true;
    emit Confirmation(msg.sender, transactionId);
    executeTransaction(transactionId);
  }


  /**
   * @dev Allows anyone to execute a confirmed transaction.
   * @param transactionId Transaction ID.
   */
  function executeTransaction(uint transactionId) internal notExecuted(transactionId) {
    if (isConfirmed(transactionId)) {
      Transaction storage txn = transactions[transactionId];
      require(getTokenBalance(txn.token) >= txn.value, "not enough amount to withdraw");
      txn.executed = true;
      if(txn.token == address(0)) {
        (bool transferSuccess,) =txn.destination.call{value: txn.value}(txn.data);
        if (transferSuccess)
          emit Execution(transactionId);
        else {
          emit ExecutionFailure(transactionId);
          txn.executed = false;
        }
      } else {
        IERC20(txn.token).safeTransfer(txn.destination, txn.value);
        emit Execution(transactionId);
      }
    }
  }
  
  /**
   * @dev Returns the confirmation status of a transaction.
   * @param transactionId Transaction ID.
   */
  
  function isConfirmed(uint transactionId) public returns (bool) {
    uint count = 0;
    for (uint i = 0; i < owners.length; i++) {
      if (confirmations[transactionId][owners[i]])
        count += 1;
      if (count == required && confirmations[transactionId][hotwallet])
        return true;
    }
  }

  /**
   * Internal functions
   *
   * @dev Adds a new transaction to the transaction mapping, if transaction does not exist yet.
   * @param destination Transaction target address.
   * @param value Transaction ether value.
   * @param data Transaction data payload.
   */
  function addTransaction(address payable destination, address token, uint value, bytes memory data, uint confirmTimestamp, uint txTimestamp) internal notNull(destination) returns (uint transactionId) {
    transactionId = transactionCount;
    transactions[transactionId] = Transaction({
      destination : destination,
      token: token,
      value : value,
      data : data,
      executed : false,
      confirmTimestamp : confirmTimestamp,
      txTimestamp : txTimestamp
      });
    transactionCount += 1;
    emit Submission(transactionId);
  }


  /**
   * Web3 call functions
   *
   * @dev Returns number of confirmations of a transaction.
   * @param transactionId Transaction ID.
   */
  function getConfirmationCount(uint transactionId) public returns (uint count) {
    for (uint i = 0; i < owners.length; i++)
      if (confirmations[transactionId][owners[i]])
        count += 1;
  }

  /**
   * @dev Returns total number of transactions after filers are applied.
   * @param pending Include pending transactions.
   * @param executed Include executed transactions.
   */
  function getTransactionCount(bool pending, bool executed) public returns (uint count) {
    for (uint i = 0; i < transactionCount; i++)
      if (pending && !transactions[i].executed || executed && transactions[i].executed)
        count += 1;
  }

  /**
   * @dev Returns the balance of token amount in this address.
   * @param token The address of token contract
   */
  function getTokenBalance(address token) internal view returns (uint count) {
    if(token == address(0)) {
      return address(this).balance;
    } else {
      return IERC20(token).balanceOf(address(this));
    }
  }


  /**
   * @dev Returns array with owner addresses, which confirmed transaction.
   * @param transactionId Transaction ID.
   */
  function getConfirmations(uint transactionId) public returns (address[] memory _confirmations) {
    address[] memory confirmationsTemp = new address[](owners.length);
    uint count = 0;
    uint i;
    for (i = 0; i < owners.length; i++)
      if (confirmations[transactionId][owners[i]]) {
        confirmationsTemp[count] = owners[i];
        count += 1;
      }
    _confirmations = new address[](count);
    for (i = 0; i < count; i++)
      _confirmations[i] = confirmationsTemp[i];
  }

  /**
   * @dev Returns list of transaction IDs in defined range.
   * @param from Index start position of transaction array.
   * @param to Index end position of transaction array.
   * @param pending Include pending transactions.
   * @param executed Include executed transactions.
   */
  function getTransactionIds(uint from, uint to, bool pending, bool executed) public returns (uint[] memory _transactionIds)
  {
    uint[] memory transactionIdsTemp = new uint[](transactionCount);
    uint count = 0;
    uint i;
    for (i = 0; i < transactionCount; i++)
      if (pending && !transactions[i].executed
      || executed && transactions[i].executed)
      {
        transactionIdsTemp[count] = i;
        count += 1;
      }
    _transactionIds = new uint[](to - from);
    for (i = from; i < to; i++)
      _transactionIds[i - from] = transactionIdsTemp[i];
  }

  function _getNow() internal view returns (uint256) {
      return block.timestamp;
  }

}
