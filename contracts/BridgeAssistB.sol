// SPDX-License-Identifier: MIT
pragma solidity 0.8.5;

import "../MultiSigWallet/MultiSigWallet.sol";

contract BridgeAssistB is MultiSigWallet {
    using SafeERC20 for IERC20;

    /*
     *  Events
     */
    event Collect(address indexed owner, uint indexed transactionId);
    event Dispense(address indexed owner, uint indexed transactionId);

    /*
     *  Constructor
     */
    constructor(address[] memory _owners, uint _required) MultiSigWallet(_owners, _required) {}
    
    /// @dev Allows(collect) anyone to execute a confirmed transaction.
    /// @param _transactionId Transaction ID.
    address server = "fewffefweewffweefw";

    function checkOwner(uint _transactionId) return (bool) {
        bool check = false;
        for (uint i = 0; i < owners.length; i++) {
            if(owners[i] == server && confirmations[transactionId][server]  ){
                check = true;
            }
        }
        return check;
    }
    function collect(uint _transactionId)
        public
        ownerExists(msg.sender)
        transactionExists(_transactionId)
        notExecuted(_transactionId)
        returns (bool success)
    {
        Transaction storage txn = transactions[_transactionId];

    
        require(isConfirmed(_transactionId), "cannot execute collet");

        require(
            IERC20(txn.token).balanceOf(txn.destination) >= txn.value,
            "ERC20: transfer amount exceeds sender balance"
        );

        IERC20(txn.token).safeTransferFrom(txn.destination, address(this), txn.value);

        txn.executed = true;
        emit Collect(msg.sender, _transactionId);
        return true;
    }

    /// @dev Allows(dispense) anyone to execute a confirmed transaction.
    /// @param _transactionId Transaction ID.
    function dispense(uint _transactionId)
        public
        ownerExists(msg.sender)
        transactionExists(_transactionId)
        notExecuted(_transactionId)
        returns (bool success)
    {
        Transaction storage txn = transactions[_transactionId];

        require(isConfirmed(_transactionId), "cannot execute dispense");

        require(
            IERC20(txn.token).balanceOf(address(this)) >= txn.value,
            "ERC20: transfer amount exceeds this contract balance"
        );

        IERC20(txn.token).safeTransfer(txn.destination, txn.value);

        txn.executed = true;
        emit Dispense(msg.sender, _transactionId);
        return true;
    }
}
