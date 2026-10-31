import { streamText, type ModelMessage } from "ai";
import { openai } from "@ai-sdk/openai";

import { tools } from "./tools/index.ts";
import { SYSTEM_PROMPT } from "./system/prompt.ts";
import { getTracer, Laminar } from "@lmnr-ai/lmnr";

import type { AgentCallbacks, ToolCallInfo } from "../types.ts";
import { filterCompatibleMessages } from "./system/filterMessages.ts";
import { executeTool } from "../agent/executeTool.ts";

const MODEL_NAME = "gpt-5-mini";

Laminar.initialize({
  projectApiKey: process.env.LMNR_PROJECT_API_KEY
})

export async function runAgent(
  userMessage: string,
  conversationHistory: ModelMessage[],
  callbacks: AgentCallbacks,
): Promise<ModelMessage[]> {

  // !!! creating combined message list with chat history, system promt and curent user prompt
  console.log("conversation history", conversationHistory);
  const workingHistory = conversationHistory //filterCompatibleMessages(conversationHistory);
  console.log("filtered history", workingHistory);
  const messages: ModelMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...workingHistory,
    { role: "user", content: userMessage }
  ]

  let fullMessage = "";
  /// !!! while loop to keep the agent loop runnning, only break when final result is returned or error occured
  /// Top loop to run through multiple turns
  while (true) {
    const result = streamText({
      model: openai(MODEL_NAME),
      messages,
      tools,
      experimental_telemetry: {
        isEnabled: true,
        tracer: getTracer()
      }
    })

    let currentMessage = ""
    const toolCalls: ToolCallInfo[] = []
    let streamError: Error | null = null
    try {
      /// !!! Looping over stram response chunks of single turn
      for await (const chunk of result.fullStream) {
        if (chunk.type === "text-delta") {
          currentMessage += chunk.text;
          // to display coming text on UI
          callbacks.onToken(chunk.text);
        }
        if (chunk.type === "tool-call") {
          const input = "input" in chunk ? chunk.input : {}
          toolCalls.push({
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            args: input as any
          })
          // to display spinner on UI
          callbacks.onToolCallStart(chunk.toolName, input);
        }
      }
    }
    catch (e) {
      streamError = e as Error
      if (!currentMessage && !streamError.message.includes("No output generated")) {
        throw streamError
      }
    }
    //!!!! End of one tern response, now we check for the tool calls and call them one by one
    fullMessage += currentMessage;
    if (streamError && !currentMessage) {
      fullMessage = "Sorry about that."
      callbacks.onToken(fullMessage)
      break;
    }
    const finnishReason = await result.finishReason;
    if (finnishReason != "tool-calls" || toolCalls.length === 0) {
      const responseMessage = await result.response;
      messages.push(...responseMessage.messages)
      break;
    }
    const responseMessage = await result.response;
    messages.push(...responseMessage.messages)

    for(const tool of toolCalls) {
      const result = await executeTool(tool.toolName, tool.args)
      callbacks.onToolCallEnd(tool.toolName, result)
      messages.push({
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: tool.toolCallId,  
            toolName: tool.toolName,
            output: {type: "text", value: result}
          }
        ]
      })
    }
  }
  callbacks.onComplete(fullMessage)
  return messages
}
