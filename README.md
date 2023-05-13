## "Handle Stale Discussions" Action for Github Actions

This Github action checks the answerable discussions when answer is proposed with keyword `@bot proposed answer`. If the expected reaction is received on the proposed answer, discussions is marked answered and closed, otherwise a label `attention` is added for further action. In case of no reaction, it's closed after N number of days. 

### Building and Testing

Install depedencies

` npm install`

Run unit tests

` npm test `

## Setup

You need to add workflow files in your repository under .github/workflows, just like any other workflow action. Since all the discussions are being checked here, Github GraphQL API Client is being used to fetch the discussions metadata and schema. Please refer to [Developer guide](SETUP.md)) for setting and installation.


## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This project is licensed under the Apache-2.0 License.

