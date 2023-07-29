const http = require("http");
const https = require("https");
const {Transform, readable} = require("stream");

class TransformStream extends Transform {}

// The name of your Azure OpenAI Resource.
const resourceName = "japan-east-01";

// The deployment name you chose when you deployed the model.
const mapper = {
  "gpt-3.5-turbo": "jet-001",
  "gpt-4": "",
};

const apiVersion = "2023-05-15";

function bindBodyParser(req) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    req.on("data", (chunk) => {
      buffer += chunk.toString();
    });
    req.on("end", () => {
      try {
        if (buffer) {
          reject();
        }
        console.log("buffer", buffer);
        resolve(JSON.parse(buffer));
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function handleRequest(request) {
  try {
    if (request.method === "OPTIONS") {
      return handleOPTIONS(request);
    }

    const url = request.url;
    console.log("url", url);
    if (url.startsWith("//")) {
      url = url.replace("/", "");
    }
    if (url === "/v1/chat/completions") {
      var path = "chat/completions";
    } else if (url === "/v1/completions") {
      var path = "completions";
    } else if (url === "/v1/models") {
      return handleModels(request);
    } else {
      if (url === "/") {
        return {body: "Proxy Azure OpenAi Successful ", status: 200};
      }
      return {body: "404 Not Found", status: 404};
    }

    console.log("bindBodyParser before ...");

    let body;
    if (request.method === "POST") {
      console.log("request", request);
      body = await bindBodyParser(request);
    }

    console.log("bindBodyParser after ...", body);

    const modelName = body?.model;
    const deployName = mapper[modelName] || "";

    if (deployName === "") {
      return {body: "Missing model mapper", status: 403};
    }
    const fetchAPI = `https://${resourceName}.openai.azure.com/openai/deployments/${deployName}/${path}?api-version=${apiVersion}`;

    console.log("request.headers");

    const authKey = request.headers.authorization;
    if (!authKey) {
      return {body: "Not allowed", status: 403};
    }

    const options = {
      method: request.method,
      headers: {
        "Content-Type": "application/json",
        "api-key": authKey.replace("Bearer ", ""),
      },
    };

    if (typeof body === "object") {
      options.body = JSON.stringify(body);
    }

    const response = await new Promise((resolve, reject) => {
      const req = https.request(fetchAPI, options, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            headers: res.headers,
            body: Buffer.concat(chunks),
            status: res.statusCode,
          })
        );
      });
      req.on("error", reject);
      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });

    // Set response headers
    response.headers["access-control-allow-origin"] = "*";

    console.log("response.body", response.body);

    return response;
  } catch (err) {
    return {body: err, status: 400};
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function handleModels(request) {
  const data = {
    object: "list",
    data: [],
  };

  for (let key in mapper) {
    data.data.push({
      id: key,
      object: "model",
      created: 1677610602,
      owned_by: "openai",
      permission: [
        {
          id: "modelperm-M56FXnG1AsIr3SXq8BYPvXJA",
          object: "model_permission",
          created: 1679602088,
          allow_create_engine: false,
          allow_sampling: true,
          allow_logprobs: true,
          allow_search_indices: false,
          allow_view: true,
          allow_fine_tuning: false,
          organization: "*",
          group: null,
          is_blocking: false,
        },
      ],
      root: key,
      parent: null,
    });
  }

  const json = JSON.stringify(data, null, 2);
  return {body: json, headers: {"Content-Type": "application/json"}};
}

async function handleOPTIONS(request) {
  return {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "*",
      "Access-Control-Allow-Headers": "*",
    },
  };
}

(async () => {
  console.log("start...");

  const server = http.createServer({}, async (req, res) => {
    const result = await handleRequest(req);

    console.log("result", result);

    // Set response headers
    Object.entries(result.headers ?? {}).forEach(([key, value]) =>
      res.setHeader(key, value)
    );

    // Set response body and status
    res.statusCode = result.status;
    res.end(result.body);
  });

  server.listen(8888, () => {
    console.log(`Server listening on port 8888`);
  });
})();
