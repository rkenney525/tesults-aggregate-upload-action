const core = require('@actions/core');
const fs = require('fs');
const { exit } = require('process');
const tesults = require('tesults');
const xml2js = require('xml2js');
const parser = new xml2js.Parser();

const token = core.getInput('target_token', { required: true });
const dataDir = core.getInput('test_data_directory', { required: true });

function getTests(suite)  {
    if (suite.suites == null || suite.suites === []) {
        return suite.tests;
    } else {
        return suite.suites.flatMap(getTests).concat(suite.tests);
    }
}

// TODO turn these into classes in other files maybe?
const createMochawesomeTestData = (filename) => {
    const fullName = `${dataDir}/${filename}`
    console.log(`processing test file: ${fullName}`);

    const rawdata = fs.readFileSync(fullName);
    const testData = JSON.parse(rawdata);

    return testData.results.flatMap(result => {
        const suite = result.file.split('/').slice(-1)[0];
        const tests = result.suites.flatMap(getTests);

        return tests.map(test => {
            const screenshots = `${dataDir}/mochawesome/${filename}`;
            const files = fs.existsSync(screenshots) ?
              fs.readdirSync(screenshots)
                .filter(filename => filename.replaceAll(' --', '').includes(test.fullTitle))
                .map(name => `${screenshots}/${name}`)
              : [];

            return {
                name: test.fullTitle,
                suite: suite,
                desc: test.code,
                reason: test.fail ? test.err.estack : null,
                duration: test.duration,
                result: test.skipped || test.pending ? 'unknown' : test.pass ? 'pass' : 'fail',
                files: files,
            }
        });
    });
};

const createJunitTestData = (filename) => {
    const fullName = `${dataDir}/${filename}`
    console.log(`processing test file: ${fullName}`);

    const rawdata = fs.readFileSync(fullName);
    let testData = [];
    parser.parseString(rawdata, function(_, data) {
        testData = data.testsuite.testcase.map(testcase => {
            let files = [];
            const screenshot = fullName.replace('.xml', '.png');
            if (fs.existsSync(screenshot)) {
                files.push(screenshot);
            }
            if (testcase["std-out"] != null && testcase["std-out"].length > 0) {
                const newFilePath = `${fullName}.stdout.log`;
                fs.writeFileSync(newFilePath, testcase["std-out"][0]);
                files.push(newFilePath);
            }
            if (testcase["std-err"] != null && testcase["std-err"].length > 0) {
                const newFilePath = `${fullName}.stderr.log`;
                fs.writeFileSync(newFilePath, testcase["std-err"][0]);
                files.push(newFilePath);
            }


            let failureReason = "";
            if (testcase.failure != null && testcase.failure.length > 0) {
                failureReason = testcase.failure[0].$message;
            } else if (testcase.error != null && testcase.error.length > 0) {
                failureReason = testcase.error[0].$message;
            }

            return {
                name: testcase.$.name,
                suite: testcase.$.classname,
                reason: failureReason != "" ? failureReason : null,
                duration: parseFloat(testcase.$.time) * 1000,
                result: failureReason != "" ? 'fail' : 'pass',
                files: files,
            }
        });
    });
    return testData;
};

const supportedFormats = {
    mochawesome: {
        ext: '.json',
        processor: createMochawesomeTestData,
    },
    junit: {
        ext: '.xml',
        processor: createJunitTestData,
    },
};

const cases = fs.readdirSync(dataDir)
    .filter(dir => supportedFormats[dir] !== undefined)
    .flatMap(dir => fs.readdirSync(`${dataDir}/${dir}`)
      .filter(filename => filename.endsWith(supportedFormats[dir].ext))
      .map(filename => `${dir}/${filename}`)
      .flatMap(filename => supportedFormats[dir].processor(filename)));


console.log('Sending the following test case data to tesults');
console.log(JSON.stringify(cases))

const data = {
    target: token,
    results: {
        cases: cases
    }
};

tesults.results(data, function (err, response) {
    console.log(`upload to tesults result: ${response.success}`);
    
    if (err) {
        console.log(`Tesults response: ${response.message}`)
        console.log(err);
    }

    exit(response.success ? 0 : 1);
});