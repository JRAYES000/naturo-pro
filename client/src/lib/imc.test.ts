import test from "node:test";
import assert from "node:assert/strict";
import { computeImc, imcLabel, ageFromDateOfBirth, poidsIdealCreff } from "./imc";

test("computeImc — cas nominal et bornes", () => {
  assert.equal(computeImc(170, 65), 22.5);
  assert.equal(computeImc(0, 65), null);
  assert.equal(computeImc(170, 0), null);
});

test("imcLabel — seuils OMS", () => {
  assert.equal(imcLabel(17), "Maigreur");
  assert.equal(imcLabel(22), "Corpulence normale");
  assert.equal(imcLabel(27), "Surpoids");
  assert.equal(imcLabel(32), "Obésité modérée");
  assert.equal(imcLabel(40), "Obésité sévère");
});

test("poidsIdealCreff — formule morphotype normal", () => {
  // taille 170, 40 ans : ((170-100) + 4) × 0,9 = 66,6
  assert.equal(poidsIdealCreff(170, 40), 66.6);
  assert.equal(poidsIdealCreff(90, 40), null);
  assert.equal(poidsIdealCreff(170, 0), null);
});

test("ageFromDateOfBirth — parsing et bornes", () => {
  const now = new Date("2026-08-12").getTime();
  assert.equal(ageFromDateOfBirth("1990-08-01", now), 36);
  assert.equal(ageFromDateOfBirth("", now), null);
  assert.equal(ageFromDateOfBirth("pas-une-date", now), null);
});
