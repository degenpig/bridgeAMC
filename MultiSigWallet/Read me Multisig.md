# MultiSigWallet

The MultiSigWallet has on goal to validate transfer transaction by several wallet limited to 10 maximum co signers managing at the same time multiple ERC20 tokens and ETH on the same contract.

More information : https://medium.com/tozex/tozex-smart-contract-library-6aaca54ca871.


### Variable

| Variable | Type | Description |
| ------ | ------ | ------ |
| transactions | public mapping (uint => Transaction) | This variable allows to set the struct Transactions
| confirmations | public mapping (uint => mapping (address => bool)) | Allowing to confirm or check a confirmation on a transaction
| isOwner | public mapping (address => bool)  | Variable used to check the wallet owner actions (submit or confrim transaction)
| owners | public address[] | Address of the owner's of the multisig wallet 
| required | public uint | Requiered number of owner's signature needed to execute a submitted transaction.
| transactionCount | public uint | Number of transactions on the MultisigWallet


### Variable Struct Transaction

| Struct variable | Type | Description |
| ------ | ------ | ------ |
| destination | address | Ethereum Wallet where the "value" will be sent
| value | uint | Amount of ether sent
| data | data  | Method id of the submitted transaction
| executed  | bool | Check the state of an executed transaction 
| TimestampofTransaction |  uint | The timestamp corresponding to submitted transaction. 
| TransactionRemainingPeriod |  uint | Countdown to confirm a submitted transaction. In the case the countdow limit is reached the submitted transaction will not be spendable. A zero value means to have an infinite time to confim the submitted transaction.


#### Constructor
The constructor get the owner's wallet address allowing them to interact with MultiSigWallet. Minimum number of signatures requiered to confirm a spendable transaction. 

#### Function

##### Function payable()

This function allows the MultisigWallet Contract to receive ether.

##### Function submitTransaction()

This function allows an owner to submit a transaction to be confirmed to be confirmed by other owners. An owner submitting the spendable transaction is confirming it by default.


##### Function confirmTransaction()

This function allows the owners to confirm a pending spendable transaction on the remaining period timespan.

##### Function executeTransaction()

This function is called automatically in confirmTransaction() when the number of signatures needed is reached allowing to execute the submitted spendable transaction.

##### Function isConfirmed()

This function checks if a submitted spendable transaction has the number of requiered confirmation needed to execute it.

##### Function addTransaction()

This function is called by submitTransaction() allowing to add a "transactionId" to identify the submitted transaction.

##### Function getConfirmationCount()

This function checks the number of confirmation a submitted spendable transaction received.

##### Function getOwnerConfirmations()

This function checks by the owner's address which confirmed a submitted sependable transaction.

##### Function getTransactionIds()

This function checks the data of spendable transaction (destination, value, executed)
