/**
 * How much coverage the answers imply.
 *
 * Pure. The method is the ordinary one — replace the income people depend on, clear what is owed,
 * fund what is already promised, then subtract what is already covered — and it is written so
 * each term can be shown separately, because a single number nobody can decompose is a number
 * nobody can question.
 *
 * Money is in whole dollars here; the inputs come from a person typing, not from a ledger.
 */

const clampYears = (years) => Math.max(0, Math.min(40, Math.round(years)))

/**
 * Years of income to replace.
 *
 * Long enough for the youngest dependent to reach adulthood, when there are dependents; the
 * remaining mortgage term otherwise; ten years when neither is known. Returned with its reason
 * so the explanation can say why this many.
 */
export function yearsToReplace(answers) {
  const ages = (answers.dependents ?? []).map((d) => Number(d.age)).filter((n) => Number.isFinite(n))
  if (ages.length > 0) {
    const youngest = Math.min(...ages)
    return {
      years: clampYears(Math.max(18 - youngest, 1)),
      because: `your youngest dependent is ${youngest}, so this covers the years until they are 18`,
    }
  }
  if (answers.mortgageYearsRemaining != null) {
    return {
      years: clampYears(answers.mortgageYearsRemaining),
      because: `you have ${answers.mortgageYearsRemaining} years left on your mortgage`,
    }
  }
  return { years: 10, because: 'nobody depends on your income and no mortgage term was given, so this is a ten-year default' }
}

export function computeNeed(answers) {
  const horizon = yearsToReplace(answers)
  const annualIncome = Math.max(0, Number(answers.incomeToReplaceAnnual ?? 0))
  const incomeComponent = annualIncome * horizon.years
  const debts = Math.max(0, Number(answers.debtsTotal ?? 0))
  const education = Math.max(0, Number(answers.educationTotal ?? 0))
  const existing = Math.max(0, Number(answers.existingCoverage ?? 0))

  const gross = incomeComponent + debts + education
  const net = Math.max(0, gross - existing)

  const terms = [
    {
      key: 'income',
      label: `${horizon.years} years of the income your household would need to replace`,
      amount: incomeComponent,
      sign: '+',
      from: `the ${annualIncome.toLocaleString('en-US')} a year you said would need replacing, and because ${horizon.because}`,
    },
    {
      key: 'debts',
      label: 'debts that would still have to be paid',
      amount: debts,
      sign: '+',
      from: 'the total debt you gave, including any mortgage balance',
    },
    {
      key: 'education',
      label: 'education and future family costs already promised',
      amount: education,
      sign: '+',
      from: education === 0 ? 'you said there were none' : 'the figure you gave for education and future costs',
    },
    {
      key: 'existing',
      label: 'cover you already have',
      amount: existing,
      sign: '-',
      from: existing === 0
        ? 'you said you had none, so nothing is subtracted'
        : 'employer and personal cover you told us about',
    },
  ]

  // A range, not a point. The arithmetic is exact; what it is about is not.
  const lower = Math.round((net * 0.9) / 1000) * 1000
  const upper = Math.round((net * 1.1) / 1000) * 1000

  const affordability = answers.affordableMonthly == null
    ? null
    : affordabilityNote(net, Number(answers.affordableMonthly))

  return {
    recommended: net,
    range: { lower, upper },
    horizon,
    terms,
    largestTerm: [...terms].filter((t) => t.sign === '+').sort((a, b) => b.amount - a.amount)[0]?.key ?? null,
    affordability,
    coveredAlready: existing >= gross && gross > 0,
  }
}

/**
 * What they said they can afford, against what the figure implies — stated without alarm.
 *
 * A rough guide only, and labelled as one: term premiums depend on age, health and the term
 * itself, none of which this tool asks for, so it cannot price anything.
 */
function affordabilityNote(need, monthly) {
  const annual = monthly * 12
  return {
    monthly,
    comfortable: annual > 0 && need / Math.max(annual, 1) < 4000,
    note: monthly === 0
      ? 'You said there is nothing spare at the moment. A smaller amount of cover still does ' +
        'something, and it can be increased later.'
      : `You said about ${monthly} a month is comfortable. Whether that buys this much cover ` +
        'depends on your age, your health and the length of the term — none of which this tool ' +
        'asks for, so it cannot tell you a premium. Take the figure to a quote and see.',
  }
}
