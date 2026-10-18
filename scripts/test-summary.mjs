// Reads the outputs of the three test runs and writes test-results/summary.md (Arabic, used in the release notes).
import { readFileSync, writeFileSync } from 'node:fs';
const read = (f) => { try { return readFileSync(f, 'utf8'); } catch { return ''; } };
const unit = JSON.parse(read('test-results/unit.json') || '{}');
const e2e = read('test-results/e2e.txt').match(/(\d+)\/(\d+) passed/);
const audit = read('test-results/audit.txt').match(/(\d+) finding\(s\)/);
const sha = (process.env.GITHUB_SHA || '').slice(0, 7);
const run = process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : '';
const lines = [
  '### نتائج الاختبارات',
  '',
  '| الفحص | النتيجة |',
  '|---|---|',
  `| اختبارات الوحدة | ${unit.numPassedTests ?? '؟'} ناجح من ${unit.numTotalTests ?? '؟'} |`,
  `| اختبارات المتصفح (CSP الإنتاجية) | ${e2e ? `${e2e[1]} ناجح من ${e2e[2]}` : 'لم تُشغَّل'} |`,
  `| تدقيق التخطيط (360 و1280 بكسل) | ${audit ? `${audit[1]} ملاحظة` : 'لم يُشغَّل'} |`,
  '',
  `الإيداع \`${sha}\`${run ? ` · [سجل التشغيل](${run})` : ''}`,
];
writeFileSync('test-results/summary.md', lines.join('\n') + '\n');
console.log(lines.join('\n'));
