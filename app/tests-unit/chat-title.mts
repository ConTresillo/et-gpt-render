import assert from "node:assert/strict";
import { chatTitle } from "../lib/chat-title";
assert.equal(chatTitle("Here's a thinking process: 1. Analyze User Input", "Which lens do I need for inspection?"), "Which lens do I need for");
assert.equal(chatTitle("<think>Private analysis</think>\nLens selection", "Which lens?"), "Lens selection");
assert.equal(chatTitle("<think>Unclosed private analysis", "Garuda inspection"), "Garuda inspection");
assert.equal(chatTitle('"Garuda inspection"', "Garuda inspection"), "Garuda inspection");
assert.equal(chatTitle("Aircraft security program in Indonesia", "What is the Garuda inspection system?"), "What is the Garuda inspection system?");
assert(chatTitle("a".repeat(200), "hello").length <= 60);
console.log("Chat title checks passed");
