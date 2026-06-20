import { describe, expect, test } from 'vitest';
import { cedictToToned } from './cedict';

describe('cedictToToned', () => {
  test('numbered tone → toned per char', () => {
    expect(cedictToToned('yin2 hang2', 2)).toEqual(['yín', 'háng']);
    expect(cedictToToned('chong2 fu4', 2)).toEqual(['chóng', 'fù']);
  });
  test('ü written as "u:"', () => {
    expect(cedictToToned('lu:3 xing2', 2)).toEqual(['lǚ', 'xíng']);
  });
  test('proper-noun capitals are lowercased', () => {
    expect(cedictToToned('Bei3 jing1', 2)).toEqual(['běi', 'jīng']);
  });
  test('neutral tone (digit 5) renders unmarked', () => {
    expect(cedictToToned('hai2 shi5', 2)).toEqual(['hái', 'shi']);
    expect(cedictToToned('yi1 ge5', 2)).toEqual(['yī', 'ge']);
  });
  test('null when the pinyin is missing or the syllable count mismatches', () => {
    expect(cedictToToned(null, 2)).toBeNull();
    expect(cedictToToned('yi1 lu4 ping2 an1', 2)).toBeNull();
  });
});
