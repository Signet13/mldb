function assertEqual(expr, val, msg)
{
    if (expr == val)
        return;
    if (JSON.stringify(expr) == JSON.stringify(val))
        return;

    plugin.log("expected", val);
    plugin.log("received", expr);

    throw "Assertion failure: " + msg + ": " + JSON.stringify(expr)
        + " not equal to " + JSON.stringify(val);
}

function succeeded(response)
{
    return response.responseCode >= 200 && response.responseCode < 400;
}

function assertSucceeded(process, response)
{
    plugin.log(process, response);

    if (!succeeded(response)) {
        throw process + " failed: " + JSON.stringify(response);
    }
}

function createAndTrainProcedure(config, name)
{
    var start = new Date();

    var createOutput = mldb.put("/v1/procedures/" + name, config);
    assertSucceeded("procedure " + name + " creation", createOutput);

    // Run the training
    var trainingOutput = mldb.put("/v1/procedures/" + name + "/runs/1", {});
    assertSucceeded("procedure " + name + " training", trainingOutput);

    var end = new Date();

    plugin.log("procedure " + name + " took " + (end - start) / 1000 + " seconds");
}

function createDataset()
{
    var start = new Date();

    var datasetConfig = {
        type: 'import.text',
        params: {
            dataFileUrl: 'https://s3.amazonaws.com/public.mldb.ai/reddit.csv.gz',
            outputDataset: { id: 'reddit_text_file' },
            limit: 1000,
            delimiter: "",
            quotechar: ""
        }
    };

    var now = new Date();

    createAndTrainProcedure(datasetConfig, "dataset load");

    var end = new Date();
    
    plugin.log("creating text dataset took " + (end - start) / 1000 + " seconds");

    var transformConfig = {
        type: "transform",
        params: {
            inputData: { 
                select: "tokenize(lineText) AS *",
                from: 'reddit_text_file'
            },
            outputDataset: { type: 'sparse.mutable', id: 'reddit' }
}
    };

    createAndTrainProcedure(transformConfig, "dataset import");
}

createDataset();

res = mldb.get('/v1/query', { q: 'select sum(horizontal_count({*})) as width from transpose(reddit) group by rowName() order by sum(horizontal_count({*})) desc limit 2' });

expected = [
      {
         "columns" : [
            [ "width", 780, "2016-03-09T02:33:24Z" ]
         ],
         "rowHash" : "1a6e08b48361f340",
         "rowName" : "\"[\"\"AskReddit\"\"]\""
      },
      {
         "columns" : [
            [ "width", 757, "2016-03-09T02:33:24Z" ]
         ],
         "rowHash" : "2d6c95775e682799",
         "rowName" : "\"[\"\"funny\"\"]\""
      }
   ];

mldb.log(res)

assertEqual(mldb.diff(expected, res.json, false /* strict */), {},
            "output was not the same as expected output");

"success"

