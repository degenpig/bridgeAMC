# MintableToken

The MintableToken is an ERC20 that Tozex modifed on their needs.

More information :

Tozex Library : https://medium.com/tozex/tozex-smart-contract-library-6aaca54ca871.
ERC20 Contract : https://medium.com/@jgm.orinoco/understanding-erc-20-token-contracts-a809a7310aa5

### Variable

| Variable | Type | Description |
| ------ | ------ | ------ |
| name | string | Offcial Token name
| symbol | string | Official Token ticker
| decimals | uint256 |Decimal efers to how divisible a token can be, from 0 (not at all divisible) to 18 (maximum).
| totalsupply | uint256 | Total amount of tokens created on the contract
| tokenOwner | address | Address of the current owner of the contract
| balances | address => uint256 | Variable to check the balance of this token
| allowed | address => mapping (address => uint256) | Variable allowing to add an address approved with the respected amount
| mintingFinished| boolean | Boolean to check if the owner can mint new tokens
| locked | boolean | Boolean to check if the Token can be transfered by wallet

#### Constructor
The constructor set the name, the symbol and the decimal of the ERC20 Token during the deployement.

#### Function

##### Function mint()
This function is used to create an amount of token on the contract or directly to a chosen address selected by the owner of the contract.

##### Function finishMinting()
This function is used to definitively fix the totalsupply of the the ERC20 Token meaning that no more tokens are gonna to be created.

##### Function burn()
This function is used to burn an amount of token only the contract.

##### Function transfer()
This function allows transfer tokens between two wallets.

##### Function transferFromContract()
This function is used to transfer token's created on the contract to a chosen wallet selected by the owner.

##### Function balanceOf()
This function is used to check the Token balance for a called wallet

##### Function transferFrom()
This function is used to execute a transfer when the wallet owner approve it

##### Function approve()
This function is used to approve an external wallet to use an amount of token which is stored on the approved wallet

##### Function allowance()
This function provides the number of tokens allowed to be transferred from a given wallet by another given wallet

##### Function increaseApproval()
This function is used to increase the amount a wallet approved previously by calling the approve function

##### Function decreaseApproval()
This function is used to decrease the amount a wallet approved previously by calling the approve function

##### Function unlockToken()
This function is used to allow transfer between wallets

##### Function lockToken()
This function is used to restreing transfer between wallets
