// SPDX-License-Identifier: MIT
pragma solidity 0.8.5;

import "../MultiSigWallet/MultiSigWallet.sol";

contract BridgeAssistE is MultiSigWallet {
    using SafeERC20 for IERC20;

    /*
     *  Events
     */
    event Collect(address indexed owner, uint indexed txIndex);
    event Dispense(address indexed owner, uint indexed txIndex);

    /*
     *  Constructor
     */
    constructor(address[] memory _owners, uint _required) MultiSigWallet(_owners, _required) {}

    /// @dev Allows(collect) anyone to execute a confirmed transaction.
    /// @param _transactionId Transaction ID.
    function collect(uint _transactionId)
        public
        ownerExists(msg.sender)
        transactionExists(_transactionId)
        notExecuted(_transactionId)
        returns (bool success)
    {
        Transaction storage txn = transactions[_transactionId];

        require(
            IERC20(txn.token).allowance(txn.destination, address(this)) >= txn.value,
            "Amount check failed"
        );

        require(
            IERC20(txn.token).burnFrom(txn.destination, txn.value),
            "burnFrom() failure: Make sure that sender's balance is not lower than the allowance sender sets"
        );

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

        require(
            IERC20(txn.token).mint(txn.destination, txn.value),
            "mint() failure: Contact contract owner"
        );

        txn.executed = true;
        emit Dispense(msg.sender, _transactionId);
        return true;
    }
}
