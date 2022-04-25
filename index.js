const core = require('@actions/core');
const fs = require('fs');
const { exit } = require('process');
const tesults = require('tesults');

const token = core.getInput('target_token', { required: true });
const dataDir = core.getInput('test_data_directory', { required: true });

const createTestData = (filename) => {
    console.log("processing test file: " + dataDir + '/' + filename);
    let rawdata = fs.readFileSync(dataDir + filename);
    let testData = JSON.parse(rawdata);
    let suite = testData.results.file.split('/').slice(-1);
    let tests = testData.results.tests.concat(testData.results.suites.flatMap( s => s.tests))
    // TODO support attachments
    return tests.map(test => {
        return {
            name: test.fullTitle,
            suite: suite,
            duration: test.duration,
            result: test.pass ? 'pass' : 'fail',
        }
    });
}

let cases = fs.readdirSync(dataDir).flatMap(createTestData);

let data = {
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