/** ปริมาณคอนกรีตต่อ 1 รอบ (คิว) */
const QTY_PER_ROUND = 2.0

export const calculateConcreteRounds = (qty: number): number[] => {
  const total = Number(qty.toFixed(2))
  if (total <= 0) return []
  if (total <= QTY_PER_ROUND) return [total]

  const fullRounds = Math.floor(total / QTY_PER_ROUND)
  const remainder = Number((total - fullRounds * QTY_PER_ROUND).toFixed(2))
  
  const rounds = Array(fullRounds).fill(QTY_PER_ROUND)
  
  if (remainder > 0) {
    if (remainder < 0.3) {
      // เศษน้อยมาก → แบ่งครึ่งกับรอบสุดท้าย เพื่อหลีกเลี่ยงรอบสั้นเกินไป
      const combined = QTY_PER_ROUND + remainder
      rounds[rounds.length - 1] = Number((combined / 2).toFixed(2))
      const lastRound = Number((combined - rounds[rounds.length - 1]).toFixed(2))
      rounds.push(lastRound)
    } else {
      rounds.push(remainder)
    }
  }
  
  return rounds
}
