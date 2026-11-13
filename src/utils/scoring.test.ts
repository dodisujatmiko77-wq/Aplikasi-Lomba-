import { describe, expect, it } from 'vitest'
import { applyRounding, calculateScore, normalizeAnswer } from './scoring'

const cfg = { basePoints: 100, speedBonus: 50 }
const at = (elapsedSec: number, total = 20) => calculateScore(true, total * 1000, (total - elapsedSec) * 1000, cfg)

describe('calculateScore — contoh pada spesifikasi', () => {
  it('benar dalam 2 dari 20 detik = 145', () => expect(at(2)).toBe(145))
  it('benar dalam 10 detik = 125', () => expect(at(10)).toBe(125))
  it('benar dalam 18 detik = 105', () => expect(at(18)).toBe(105))
  it('salah = 0', () => expect(calculateScore(false, 20000, 18000, cfg)).toBe(0))
  it('tepat di awal = 150, tepat di deadline = 100', () => {
    expect(at(0)).toBe(150)
    expect(at(20)).toBe(100)
  })
})

describe('calculateScore — aturan', () => {
  it('lebih cepat selalu lebih tinggi', () => {
    for (let s = 0; s < 20; s += 0.5) expect(at(s)).toBeGreaterThan(at(s + 0.5))
  })
  it('bonus hanya untuk jawaban benar', () => {
    expect(calculateScore(false, 20000, 20000, cfg)).toBe(0)
  })
  it('sisa waktu di luar rentang dijepit', () => {
    expect(calculateScore(true, 20000, 99999, cfg)).toBe(150)
    expect(calculateScore(true, 20000, -500, cfg)).toBe(100)
  })
  it('penalti jawaban salah dapat dikonfigurasi', () => {
    expect(calculateScore(false, 20000, 5000, { ...cfg, wrongPenalty: 25 })).toBe(-25)
  })
  it('pembulatan dua desimal dengan presisi milidetik', () => {
    // sisa 12.345 dtk → 100 + 50 × 0,61725 = 130,8625
    expect(calculateScore(true, 20000, 12345, cfg)).toBe(130.86)
    expect(calculateScore(true, 20000, 12345, { ...cfg, roundingMode: 'ceil' })).toBe(130.87)
    expect(calculateScore(true, 20000, 12345, { ...cfg, roundingMode: 'floor' })).toBe(130.86)
    expect(calculateScore(true, 20000, 12345, { ...cfg, roundingDecimals: 0 })).toBe(131)
  })
  it('skor dasar, bonus, dan durasi dapat diubah', () => {
    expect(calculateScore(true, 30000, 15000, { basePoints: 200, speedBonus: 100 })).toBe(250)
  })
})

describe('applyRounding', () => {
  it('tidak terpengaruh galat biner', () => {
    expect(applyRounding(1.005, 'round', 2)).toBe(1.01)
    expect(applyRounding(130.8625, 'floor', 2)).toBe(130.86)
  })
})

describe('normalizeAnswer', () => {
  it('mengabaikan huruf besar/kecil dan spasi secara default', () => {
    expect(normalizeAnswer('  Ir.  SOEKARNO ')).toBe(normalizeAnswer('ir.soekarno'))
  })
  it('menghormati pengaturan peka huruf & spasi', () => {
    expect(normalizeAnswer('Asia', true)).not.toBe(normalizeAnswer('asia', true))
    expect(normalizeAnswer(' buku  tulis ', false, false)).toBe('buku tulis')
  })
})
