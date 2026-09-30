/**
 * The HTTP surface for the conversation.
 *
 * One question at a time (`GET /next`), one answer at a time (`POST /answer`), a revision that
 * recomputes without restarting (`POST /revise`), and the assessment (`GET /assessment`).
 *
 * The recommendation is computed in `needs.js`, which is pure and tested. No model produces a
 * figure here. If a model were added to rephrase, it would rephrase a number that already exists.
 */
import { createServer } from 'node:http'
import { computeNeed } from './needs.js'
import { nextQuestion, outstanding, parseAnswer, QUESTIONS, REQUIRED } from './flow.js'
import { explainAssessment, explainTermVersusPermanent } from './explain.js'

const PORT = Number(process.env.PORT ?? 8080)

/**
 * In memory, for the length of the conversation, and nowhere else.
 *
 * These answers are somebody's income, their debts and the ages of their children. There is no
 * database here on purpose, nothing is written to disk, and `log()` carries no answer — only
 * which question was reached. A tool that asks for this and then keeps it has taken something it
 * was not given.
 */
const sessions = new Map()

function log(event, fields = {}) {
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), event, ...fields })}\n`)
}

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body, null, 2))
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
    if (chunks.reduce((n, c) => n + c.length, 0) > 32 * 1024) {
      throw Object.assign(new Error('The request was too large.'), { status: 413 })
    }
  }
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw Object.assign(new Error('The request body was not valid JSON.'), { status: 400 })
  }
}

function session(id) {
  if (!sessions.has(id)) sessions.set(id, { answers: {}, asked: [] })
  return sessions.get(id)
}

function state(id) {
  const s = session(id)
  const question = nextQuestion(s.answers)
  return {
    sessionId: id,
    question,
    outstanding: outstanding(s.answers),
    answered: Object.keys(s.answers),
    complete: question === null,
  }
}

const ROUTES = {
  'GET /': (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(PAGE)
  },

  'GET /health': (_req, res) => json(res, 200, { ok: true }),

  'POST /start': async (_req, res) => {
    const id = `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    session(id)
    log('conversation.started', { sessionId: id })
    json(res, 200, {
      ...state(id),
      opening:
        'I can work out roughly how much life cover your situation implies, and show you the ' +
        'arithmetic so you can argue with it. Six things, one at a time. Nothing is stored.',
    })
  },

  'GET /next': (req, res) => {
    const id = new URL(req.url, 'http://local').searchParams.get('sessionId') ?? ''
    json(res, 200, state(id))
  },

  'POST /answer': async (req, res) => {
    const body = await readBody(req)
    const id = String(body.sessionId ?? '')
    const s = session(id)
    const questionId = String(body.questionId ?? '')
    if (!QUESTIONS[questionId]) {
      json(res, 422, { message: `There is no question called "${questionId}".` })
      return
    }
    const parsed = parseAnswer(questionId, body.answer)
    if (parsed.error) {
      json(res, 422, { message: parsed.error, question: QUESTIONS[questionId] })
      return
    }
    s.answers[questionId] = parsed.value
    s.asked.push(questionId)
    // The question id, never the answer.
    log('answer.recorded', { sessionId: id, questionId })
    json(res, 200, state(id))
  },

  /** Change one answer; the assessment recomputes from the changed set, no restart. */
  'POST /revise': async (req, res) => {
    const body = await readBody(req)
    const id = String(body.sessionId ?? '')
    const s = session(id)
    const questionId = String(body.questionId ?? '')
    if (s.answers[questionId] === undefined) {
      json(res, 422, { message: `"${questionId}" has not been answered yet, so there is nothing to revise.` })
      return
    }
    const before = computeNeed(s.answers).recommended
    const parsed = parseAnswer(questionId, body.answer)
    if (parsed.error) {
      json(res, 422, { message: parsed.error })
      return
    }
    s.answers[questionId] = parsed.value
    const after = computeNeed(s.answers)
    log('answer.revised', { sessionId: id, questionId })
    json(res, 200, {
      changed: questionId,
      recommendedBefore: before,
      recommendedAfter: after.recommended,
      movedBy: after.recommended - before,
      assessment: after,
      explanation: explainAssessment(s.answers, after),
    })
  },

  'GET /assessment': (req, res) => {
    const id = new URL(req.url, 'http://local').searchParams.get('sessionId') ?? ''
    const s = session(id)
    const missing = outstanding(s.answers)
    if (missing.length > 0) {
      json(res, 409, {
        message: 'Not everything has been answered yet, so an assessment would be guessing.',
        outstanding: missing,
        question: nextQuestion(s.answers),
      })
      return
    }
    const assessment = computeNeed(s.answers)
    json(res, 200, {
      assessment,
      explanation: explainAssessment(s.answers, assessment),
      termVersusPermanent: explainTermVersusPermanent(s.answers, assessment),
    })
  },
}

export const app = createServer((req, res) => {
  const key = `${req.method} ${(req.url ?? '/').split('?')[0]}`
  const handler = ROUTES[key]
  if (!handler) {
    json(res, 404, { message: `Nothing is served at ${key}.` })
    return
  }
  Promise.resolve(handler(req, res)).catch((err) => {
    // Says what failed, and keeps the conversation: somebody six answers in should not start again.
    log('request.failed', { route: key, message: err.message })
    if (!res.headersSent) {
      json(res, err.status ?? 500, {
        message: err.status ? err.message : 'Something went wrong working that out.',
        yourAnswersAreKept: true,
        whatToDo: 'Ask for the same thing again — nothing you have told me was lost.',
      })
    }
  })
})

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Life cover needs conversation</title>
<style>body{font-family:system-ui,sans-serif;max-width:44rem;margin:2rem auto;padding:0 1rem;line-height:1.55}
code{background:#f4f4f2;padding:.1rem .3rem}</style></head><body>
<h1>How much life cover does your situation imply?</h1>
<p>Six questions, one at a time. You get a figure, the arithmetic behind it, and the ability to
change any answer and watch it move.</p>
<p>This is an estimate produced from what you type. It is <strong>not personalised financial
advice and not a quote</strong>, and it does not know your age, health or tax position.</p>
<ol>
<li><code>POST /start</code></li>
<li><code>GET /next?sessionId=…</code> — the next question, and why it is asked</li>
<li><code>POST /answer</code> — one answer</li>
<li><code>GET /assessment?sessionId=…</code> — the figure, the arithmetic, term against permanent</li>
<li><code>POST /revise</code> — change one answer; see what it does</li>
</ol>
<p>Nothing you type is written to disk or to the log.</p>
</body></html>`

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => log('server.listening', { port: PORT, required: REQUIRED.length }))
}
