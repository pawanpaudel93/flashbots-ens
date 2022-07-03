# Flashbots-ens

1. Run the following commands to install the dependencies:
```
yarn
```
OR
```
npm install
``` 

2. Copy .env.example to .env and fill in the values.

3. Edit ensRegister.ts in the scripts folder to set the desired ens name and others.

4.  Run the following commands to run the ensRegister script:
```
npx hardhat run scripts/ensRegister.ts --network goerli
```
