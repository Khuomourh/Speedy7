const { handleApi, jsonResponse } = require("../server");

module.exports = async function speedy7Api(request, response) {
  try {
    const pathname = new URL(request.url || "/", "http://127.0.0.1").pathname;
    const handled = await handleApi(request, response, pathname);
    if (!handled) jsonResponse(response, 404, { error: "API route not found" });
  } catch (error) {
    jsonResponse(response, 500, { error: error.message || "Server error" });
  }
};
