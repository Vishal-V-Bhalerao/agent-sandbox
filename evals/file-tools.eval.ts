import { evaluate } from "@lmnr-ai/lmnr";
import { toolSelectionScore } from "./evaluators";

import type { EvalData, EvalTarget } from "./types";
import dataset from "./data/file-tools.json" with {type: "json"}
import { singleTurnExecuter } from "./executors";

const testExecuter = async (data: EvalData) => {
    return singleTurnExecuter(data);
}

evaluate({
    data: dataset as any,
    executor: testExecuter,
    evaluators: {
        selectionScore: (outputData: any, expectedData: any) => {
            if(expectedData?.category === "secondary") return 1 // avoid tilting the evaluation score due to low priority test cases
            return toolSelectionScore(outputData, expectedData)
        }
    },
    groupName: "file-module-evaluator"
});