exports.handler = async function(event) {
  try {
    console.log("submission-created triggered");

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        message: "Submission received. Final email flow placeholder active."
      })
    };
  } catch (error) {
    console.error("Function error:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: error.message
      })
    };
  }
};
