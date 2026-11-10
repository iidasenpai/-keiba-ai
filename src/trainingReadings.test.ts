import {describe,it,expect} from 'vitest';
import {readWorkout,workoutReadings,effortKind} from './trainingReadings';
import {trainingAssessment} from './assessments';
describe('identified workout evidence',()=>{
 it('does not turn 3F into 1F or infer from unlabelled clocks',()=>{
  expect(readWorkout('11/8',['3F 37.6','馬なり']).lastF).toBe(null);
  expect(readWorkout('11/8',['52.0 37.6 12.0']).lastF).toBe(null);
 });
 it('derives acceleration from adjacent real furlongs',()=>{
  const s=readWorkout('11/8',['2F 25.0 1F 12.0']);expect(s.acceleration).toBe(1);
  expect(readWorkout('11/8',['2F 23.2 1F 12.0']).acceleration).toBe(-0.8);
 });
 it('handles headers and explicit laps',()=>{
  expect(readWorkout('11/8',['4F 3F 2F 1F','52.0 38.0 25.0 12.0']).acceleration).toBe(1);
  expect(readWorkout('11/8',['ラップ: 13.0-12.0-11.8']).acceleration).toBe(0.2);
 });
 it('keeps strong and all-out effort separate',()=>{
  expect(effortKind('強目')).toBe('強め');expect(effortKind('一杯')).toBe('一杯');expect(effortKind('馬也')).toBe('馬なり');
 });
 it('compares previous-race session only under matching conditions',()=>{
  const lines=['(前回) 10/20 コース:栗坂 馬場:良 馬なり','1F 12.8','11/8 コース:栗坂 馬場:良 馬なり','1F 12.0'];
  expect(workoutReadings(lines).previousDelta).toBe(0.8);
  expect(workoutReadings(lines.map(x=>x.replace('11/8 コース:栗坂','11/8 コース:美坂'))).previousDelta).toBe(null);
  expect(workoutReadings(lines.map(x=>x.replace('11/8 コース:栗坂 馬場:良 馬なり','11/8 コース:栗坂 馬場:良 一杯'))).previousDelta).toBe(null);
 });
 it('chooses chronological latest regardless of display order',()=>{
  expect(workoutReadings(['11/8','1F 12.0','11/4','1F 13.0']).latest?.lastF).toBe(12);
 });
 it('does not reward effort or unverified absolute clocks alone',()=>{
  const a=(line:string)=>trainingAssessment({summary:'順調',arrow:'→',lines:['11/8',line]}).numeric;
  expect(a('1F 11.0 馬なり')).toBe(a('1F 13.5 一杯'));
 });
 it('preserves neutral missing data and explicit deceleration evidence',()=>{
  const x=trainingAssessment({summary:'',arrow:'→',lines:[]});expect(x.numeric).toBe(70);expect(x.lastF).toBe(null);
  const y=trainingAssessment({summary:'',arrow:'→',lines:['11/8','2F 23.2 1F 12.0']});expect(y.acceleration).toBe(-0.8);expect(y.numeric<70).toBe(true);
 });
});

it('positive acceleration uses effort, never effort alone',()=>{
 const score=(effort:string)=>trainingAssessment({summary:'',arrow:'→',lines:['11/8',`2F 25.0 1F 12.0 ${effort}`]}).numeric;
 expect(score('馬なり')>score('強め')).toBe(true);expect(score('強め')>score('一杯')).toBe(true);expect(score('')).toBe(70);
});
