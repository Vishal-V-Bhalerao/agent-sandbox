import { generateText, stepCountIs, tool, type ToolSet } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod"
import type {
  EvalData,
  SingleTurnResult,
  MultiTurnEvalData,
  MultiTurnResult,
} from "./types.ts";
import { buildMessages } from "./utils.ts";

/**
 * !!!!
 * This file contains single turn executer, which nothing but dummy agent runner.
 * which accepts mock tools as args, calls real models and verifies toolcalls
 * Its a common function that be use across different evals
 * !!!!
 * */
const MODEL_NAME = "gpt-5-mini";

/**
 * !!!!
 * All tool definations, this is created from real tools list but wihtout execute method
 * !!!!
 * */
const TOOL_DEFINATION: ToolSet = {
  readFile: {
    description: "use this to read the conents of a file at specified path",
    inputSchema: z.object({
      path: z.string().describe("the path to the file that you want to read")
    })
  },
  writeFile: {
    description: "use this to write the given conents to the file at specified path",
    inputSchema: z.object({
      path: z.string().describe("the path to the file that you want to write"),
      content: z.string().describe("content that you want to write in the file")
    })
  },
  listFiles: {
    description: "use this to list all files in directory at given path",
    inputSchema: z.object({
      path: z.string().describe("the path to the directory for which you want to list all files")
    })
  },
  deleteFile: {
    description: "use this to delete a file from specified path",
    inputSchema: z.object({
      path: z.string().describe("the path to the file that you want to delete")
    })
  },
  runCommand: {
    description: "use this to run shell command and return its output",
    inputSchema: z.object({
      command: z.string().describe("the shell command to execute")
    })
  },
};

export const singleTurnExecuter = async (data: EvalData) => {
  const messages = buildMessages(data);

  const tools: ToolSet = {}
  for (const toolName of data.tools) {
    const def = TOOL_DEFINATION[toolName]
    if (def) {
      tools[toolName] = tool({
        inputSchema: def.inputSchema,
        description: def.description
      })
    }
  }

  const { toolCalls, text } = await generateText({
    model: openai(MODEL_NAME),
    messages,
    tools,
    stopWhen: stepCountIs(1),
    temperature: data.config?.temperature ?? undefined
  })

  const calls = toolCalls.map((tc) => ({
    toolName: tc.toolName,
    args: "args" in tc ? tc.args : {}
  }))

  const toolNames = toolCalls.map((tc) => (tc.toolName))
  return {
    toolCalls,
    toolNames,
    selectedAny: toolNames.length > 0
  }
}