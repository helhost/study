I want you to transform the attached study JSON into an exam-resilient version.

Important: do NOT imitate the past exam papers directly. Use the exams only as calibration for the expected cognitive level, not as a source to copy question wording, topics, or exact structure.

Goal:
Create a new JSON file that preserves the original schema exactly, but improves the questions so they test durable understanding rather than trivia.

Input:
- A JSON file containing study material.
- Past/sample exam papers.
- Possibly lecture/chapter notes.

Output:
- A valid JSON file only.
- Preserve the same top-level structure as the input JSON.
- Preserve the same item schema.
- Do not add new fields unless they already exist in the input.
- Do not change the app-facing structure.
- Use only the existing item types/subtypes found in the input, such as:
  - flashcard
  - quiz / multiple_choice
  - quiz / true_false
  - quiz / text_answer
- Make sure the output can be parsed by the same quiz program.

Transformation philosophy:
The past exams should tell you the level of thinking expected, such as:
- precise definitions
- distinguishing similar concepts
- applying principles to scenarios
- mapping mechanisms to security principles/frameworks
- explaining failure modes
- discussing tradeoffs
- identifying assumptions in threat models
- giving concise answer plans for longer questions

But do NOT overfit to the past papers. Do not turn the material into a clone of the exam format. Do not focus only on topics that appeared in previous exams. Preserve the lecture/chapter coverage from the original JSON.

Avoid low-value trivia:
- Do not ask for exact dates, names, paper years, incident dates, or historical details unless the source material clearly treats them as central.
- For named incidents or examples, ask what security principle, failure mode, threat model, tradeoff, or lesson they illustrate.
- Prefer “What does this example show?” over “When did this happen?”

Prioritise these question styles:
1. Definition:
   Test whether the concept can be stated accurately.

2. Distinction:
   Ask the learner to distinguish similar terms, such as threat vs vulnerability, privacy vs confidentiality, integrity vs authenticity, policy vs mechanism.

3. Principle mapping:
   Give a mechanism or scenario and ask which principle, model, or framework applies.

4. Scenario application:
   Give a short realistic scenario and ask the learner to apply the concept.

5. Failure analysis:
   Ask why a system, policy, mechanism, or assumption fails.

6. Tradeoff reasoning:
   Ask about costs, usability, risk, assurance, incentives, attack surface, or operational constraints.

7. Long-answer preparation:
   For broad themes, create concise text-answer prompts that train answer plans rather than full essays.

Rebalancing guidance:
- Keep enough flashcards for core definitions.
- Add more application and distinction questions.
- Reduce overly direct recall where possible.
- Reduce true/false questions that only test obvious negations.
- Keep multiple choice questions, but make distractors plausible and conceptually meaningful.
- Use text_answer questions for short-answer and long-answer-plan practice.
- Do not make the output excessively longer than the input unless necessary. A moderate increase is acceptable if it improves coverage.

Length constraint:
- Aim for a maximum of 50 flashcards and 50 quiz questions.
- Try not to exceed 100 total entries unless the source material genuinely contains too much important content to cover responsibly within that limit.
- If the input file is small, use fewer than 50 flashcards and fewer than 50 quiz questions.
- Prefer quality and coverage over hitting the maximum.
- Remove duplicates, low-value trivia, and overly narrow examples before increasing length.
- If important content must be omitted to stay within the limit, prioritise:
  1. core concepts and definitions
  2. distinctions between similar concepts
  3. principles, models, and frameworks
  4. scenario application
  5. common misconceptions
  6. named examples only when they teach a general security lesson
- Try to keep the final set balanced:
  - 35-50 flashcards for concept coverage
  - 35-50 quiz questions for exam-style practice
- Quiz questions should include a useful mix of multiple choice, true/false, and text answer, based on the input schema.

Quality rules:
- Every answer must be directly supported by the input material or the attached notes/exams.
- Do not invent course content.
- Do not introduce facts from outside the provided files unless they are necessary general knowledge and clearly consistent with the source material.
- If an original item appears incorrect or too brittle, rewrite it into a safer conceptual form.
- If a named example appears, preserve the lesson, not the trivia.
- Avoid duplicate questions testing the same thing in the same way.
- Ensure all JSON is syntactically valid.

Multiple-choice rules:
- Use zero-based answer indexes if the input JSON uses zero-based indexes.
- Preserve the answer format used in the input.
- Make exactly one option clearly correct unless the input format supports otherwise.
- Avoid silly or obviously wrong distractors.
- Distractors should reflect common confusions.

True/false rules:
- Use boolean true/false if the input uses booleans.
- Focus on common misconceptions.
- Avoid questions that are only word games.

Text-answer rules:
- Answers should be concise but complete.
- For long-answer-plan questions, the answer should give a compact plan with the main points expected.
- Prefer generalisable reasoning over memorised examples.

Flashcard rules:
- Front should name a concept or ask a focused question.
- Back should explain the concept clearly and compactly.
- Avoid overly long backs unless needed for a major framework.

Final task:
Read the attached JSON and past exams. Then produce a transformed JSON file that follows all the rules above. Output only the JSON, with no commentary before or after.
