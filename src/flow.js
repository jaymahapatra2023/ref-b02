/**
 * The conversation: one question at a time, and which question depends on the answers so far.
 *
 * Pure, so the branching is testable without a browser. Two branches carry real weight — a
 * person with no dependents is not asked about education, and a person with no debt is not asked
 * how long is left on a mortgage — because asking either would signal the tool was not listening.
 */

export const QUESTIONS = {
  dependents: {
    id: 'dependents',
    ask: 'Who depends on your income? Tell me their ages, or say nobody.',
    why: 'Who depends on you decides how long income would need replacing.',
  },
  incomeToReplaceAnnual: {
    id: 'incomeToReplaceAnnual',
    ask: 'Roughly how much of your yearly income would your household need to replace?',
    why: 'This is the largest part of most coverage figures.',
  },
  debtsTotal: {
    id: 'debtsTotal',
    ask: 'What debts would be left behind — mortgage, loans, anything else? A total is fine.',
    why: 'Debts do not disappear, so cover usually clears them.',
  },
  mortgageYearsRemaining: {
    id: 'mortgageYearsRemaining',
    ask: 'How many years are left on the mortgage?',
    why: 'With nobody depending on your income, the mortgage term is what sets the horizon.',
  },
  educationTotal: {
    id: 'educationTotal',
    ask: 'Is there education or another future family cost you would want covered? A total, or nothing.',
    why: 'Costs already promised are part of what cover is for.',
  },
  existingCoverage: {
    id: 'existingCoverage',
    ask: 'What life cover do you already have, through work or your own policy?',
    why: 'What you already have is subtracted, so the figure is what is missing.',
  },
  affordableMonthly: {
    id: 'affordableMonthly',
    ask: 'Roughly what could you comfortably put towards this each month?',
    why: 'A figure you cannot sustain is not a plan, so this is asked before anything is recommended.',
  },
}

/** The six input categories the assessment needs, whatever route the conversation took. */
export const REQUIRED = [
  'dependents', 'incomeToReplaceAnnual', 'debtsTotal', 'educationTotal',
  'existingCoverage', 'affordableMonthly',
]

const answered = (answers, key) => answers[key] !== undefined && answers[key] !== null

export function nextQuestion(answers) {
  if (!answered(answers, 'dependents')) return QUESTIONS.dependents
  if (!answered(answers, 'incomeToReplaceAnnual')) return QUESTIONS.incomeToReplaceAnnual
  if (!answered(answers, 'debtsTotal')) return QUESTIONS.debtsTotal

  const hasDependents = (answers.dependents ?? []).length > 0
  const hasDebt = Number(answers.debtsTotal ?? 0) > 0

  // Branch one: the mortgage term only matters when nobody's dependency sets the horizon.
  if (!hasDependents && hasDebt && !answered(answers, 'mortgageYearsRemaining')) {
    return QUESTIONS.mortgageYearsRemaining
  }
  // Branch two: education is not asked of somebody with nobody to educate.
  if (hasDependents && !answered(answers, 'educationTotal')) return QUESTIONS.educationTotal

  if (!answered(answers, 'existingCoverage')) return QUESTIONS.existingCoverage
  if (!answered(answers, 'affordableMonthly')) return QUESTIONS.affordableMonthly
  return null
}

/** What is still outstanding, so the client can show progress honestly. */
export function outstanding(answers) {
  const needed = REQUIRED.filter((key) => {
    if (key === 'educationTotal') return (answers.dependents ?? []).length > 0
    return true
  })
  return needed.filter((key) => !answered(answers, key))
}

/** Normalise an answer to the shape the arithmetic expects, or say why it cannot be used. */
export function parseAnswer(id, raw) {
  if (id === 'dependents') {
    if (typeof raw === 'string' && /^(no|nobody|none|n\/a)$/i.test(raw.trim())) return { value: [] }
    if (Array.isArray(raw)) {
      const bad = raw.find((d) => !Number.isFinite(Number(d?.age)))
      if (bad) return { error: 'Each dependent needs an age, as a number.' }
      return { value: raw.map((d) => ({ name: String(d.name ?? 'dependent'), age: Number(d.age) })) }
    }
    return { error: 'Tell me the ages of the people who depend on you, or say nobody.' }
  }
  const n = Number(String(raw).replace(/[$,\s]/g, ''))
  if (!Number.isFinite(n) || n < 0) return { error: 'That needs to be a number, and not a negative one.' }
  return { value: n }
}
