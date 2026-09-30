# Life cover needs conversation

Six questions, one at a time, adapting to the answers. You get a coverage figure, the arithmetic
behind it, an explanation of term against permanent cover written from your own answers, and the
ability to change any answer and see what it does to the result.

**This is an estimate produced from what you type.** It is not personalised financial advice and
not a quote. It does not know your age, health or tax position.

## Run it

```
docker build -t needs . && docker run --rm -p 8080:8080 needs
```

or, with Node 22 and nothing to install:

```
npm start        # http://localhost:8080
npm test         # the arithmetic, the branching and the tone
```

## The conversation

```
POST /start                        → a session, and the first question
GET  /next?sessionId=…             → the next question, and why it is being asked
POST /answer                       → one answer: { sessionId, questionId, answer }
GET  /assessment?sessionId=…       → the figure, the arithmetic, term against permanent
POST /revise                       → change one answer; the reply says how far the figure moved
```

It asks about the six things that shape a coverage figure: who depends on the income, how much
income would need replacing, what debts would be left, education or other promised costs, cover
already held, and what is comfortably affordable.

**It adapts.** Somebody with no dependents is asked how long is left on the mortgage and is never
asked about education; somebody with dependents is asked about education and never about the
mortgage term. The horizon is then read off whichever of those set it. `test/flow.test.js` proves
two different answer sets produce two different sequences.

## How the figure is produced

`src/needs.js` — pure, tested — computes it: income over the horizon, plus debts, plus promised
education costs, less cover already held, floored at zero and reported as a range. Every term is
returned with the answer it came from, which is what lets `src/explain.js` show the arithmetic
rather than summarise it. No language model produces any figure.

`POST /revise` recomputes from the changed answer set and reports how far the figure moved, so a
reader can test the recommendation against their own doubts without starting again.

## Term against permanent

`explainTermVersusPermanent` states the two definitions plainly — term is cover for a defined
period; permanent is designed to stay in place longer and may include features beyond the death
benefit, depending on the product — and then relates them to this person: the years until the
youngest dependent turns 18, or the years left on the mortgage. A generic list of trade-offs follows it.

It claims no price, guarantee or named product feature, because this tool holds no product data.
A test asserts that.

## Data handling

Answers live in memory for the length of the conversation and are never written to disk. The log
records which question was reached and never what was said: the answers include somebody's income,
their debts and the ages of their children. There is no credential in this repository — `PORT` is
the only variable read.
