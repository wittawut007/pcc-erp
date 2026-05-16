export const calculateConcreteRounds = (qty: number): number[] => {
  const total = Number(qty.toFixed(2))
  if (total <= 0) return []
  if (total <= 1) return [total]

  const fullRounds = Math.floor(total)
  const remainder = Number((total - fullRounds).toFixed(2))
  
  const rounds = Array(fullRounds).fill(1.0)
  
  if (remainder > 0) {
    if (remainder < 0.3) {
      // Combine with the last full round
      const combined = 1.0 + remainder
      rounds[rounds.length - 1] = Number((combined / 2).toFixed(2))
      const lastRound = Number((combined - rounds[rounds.length - 1]).toFixed(2))
      rounds.push(lastRound)
    } else {
      rounds.push(remainder)
    }
  }
  
  return rounds
}
