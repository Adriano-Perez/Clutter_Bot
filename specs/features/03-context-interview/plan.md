# Implementation Plan: Context Interview

Owner: **B** (Adriano), with **A** reviewing the Gemini schema. Phase 2.

## Tasks
- [ ] `QuestionBank` with 3 questions and skip logic for the zone question
- [ ] Local parser: digits, ranges (`2-4`), `none`, `skip`, comma/`and` lists
- [ ] `GeminiClient` (shared): JSON-schema call helper with 10 s timeout and zod validation
- [ ] Gemini label-resolution prompt: input = item list + answer; output = `{itemIds[], zoneIds[], ambiguous[]}`
- [ ] Clarifying question when `ambiguous` is non-empty
- [ ] Echo line formatter (number + label)
- [ ] `InterviewHandler` state transitions; on completion call `Planner.build()` (feature 04)
- [ ] Fixture `test/fixtures/answers.json` with 10 scripted answers + expected IDs
- [ ] Unit tests: local parser, transitions, ≥ 9/10 fixture accuracy (Gemini calls mocked from saved responses)
- [ ] PR → review → merge

## Files to Create or Modify
- `src/handlers/interview.ts`: `InterviewHandler`, `QuestionBank`
- `src/nlp/answerParser.ts`: local + Gemini parsing
- `src/llm/gemini.ts`: shared `GeminiClient` (text JSON + image edit)
- `test/fixtures/answers.json`
- `test/interview.test.ts`

## Dependencies
- Features `01-imessage-gateway`, `02-item-detection`
- `@google/genai`, `zod`
- Feature `04-organization-plan` (`Planner.build`), stubbed until it exists
