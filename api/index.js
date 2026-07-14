const { handleApi, jsonResponse } = require("../server");

module.exports = async function speedy7Api(request, response) {
  try {
    const routePath = Array.isArray(request.query?.path)
      ? request.query.path.join("/")
      : String(request.query?.path || "").replace(/^\/+/, "");
    const requestUrl = new URL(request.url || "/api", "https://speedy7.vercel.app");
    const pathname = routePath
      ? `/api/${routePath}`
      : requestUrl.pathname.replace(/^\/api\/index\/?/, "/api/");
    const handled = await handleApi(request, response, pathname);

    if (!handled) jsonResponse(response, 404, { error: "API route not found" });
  } catch (error) {
    console.error("Speedy7 API error:", error);
    if (!response.headersSent) {
      jsonResponse(response, 500, { error: "Speedy7 API request failed" });
    } else if (!response.writableEnded) {
      response.end();
    }
  }
};
