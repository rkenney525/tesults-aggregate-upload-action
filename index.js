const core = require('@actions/core');
const fs = require('fs');
const { exit } = require('process');
const tesults = require('tesults');

const token = core.getInput('target_token', { required: true });
const dataDir = core.getInput('test_data_directory', { required: true });

function getTests(suite)  {
    if (suite.suites === []) {
        return suite.tests;
    } else {
        return suite.suites.flatMap(getTests).concat(suite.tests);
    }
}

const createTestData = (filename) => {
    const fullName = dataDir + '/' + filename
    console.log("processing test file: " + fullName);

    const rawdata = fs.readFileSync(fullName);
    const testData = JSON.parse(rawdata);

    return testData.results.flatMap(result => {
        const suite = result.file.split('/').slice(-1);
        const tests = getTests(result.suites);
        // TODO support attachments
        return tests.map(test => {
            return {
                name: test.fullTitle,
                suite: suite,
                duration: test.duration,
                result: test.pass ? 'pass' : 'fail',
            }
        });
    });
}

const cases = fs.readdirSync(dataDir).flatMap(createTestData);

const data = {
    target: token,
    results: {
        cases: cases
    }
};

tesults.results(data, function (err, response) {
    console.log("upload to tesults result: " + response.success);
    
    if (err) {
        console.log("Tesults response: " + response.message)
        console.log(err);
    }

    exit(response.success ? 0 : 1);
});