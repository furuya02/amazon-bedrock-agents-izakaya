/* eslint-disable no-prototype-builtins */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
exports.handler = async function (event: any) {
  // パラメータ表示
  const params: { date: string; hour: string; numberOfPeople: string } = { date: "", hour: "", numberOfPeople: "" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event["parameters"].forEach((param: any) => {
    const key = param["name"] as keyof typeof params;
    if (params.hasOwnProperty(key)) {
      params[key] = param["value"];
    }
  });
  console.log(`date(予約日):${params.date} hour(時間):${params.hour} numberOfPeople(人数):${params.numberOfPeople}`);

  // レスポンス
  return {
    messageVersion: "1.0",
    response: {
      actionGroup: event["actionGroup"],
      function: event["function"],
      functionResponse: {
        responseBody: {
          TEXT: {
            body: "OK",
          },
        },
      },
    },
    sessionAttributes: event["sessionAttributes"],
    promptSessionAttributes: event["promptSessionAttributes"],
  };
};
