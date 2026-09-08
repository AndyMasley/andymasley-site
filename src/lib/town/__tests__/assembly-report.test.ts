// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { auditAssemblyReports } from '../assembly-report';
describe('actual assembly acceptance',()=>{
  it('does not accept finite fallback geometry when registered grading was rejected',()=>{
    const report={rejected:true,rejectionReason:'Horizontal area mismatch on face 42'};
    const result=auditAssemblyReports({assemblyReports:{streetCornerGround:report,streetCorners:{skipped:true,reason:'Registered corner grading did not apply'}},streetCornerGroundResult:report,optionalDetailMissing:['streetCornerGround']},{streetCornerGround:{},streetCorners:{}});
    expect(result.errors).toContain('Incomplete optional correction: streetCornerGround');
    expect(result.errors.some(e=>e.includes('face 42'))).toBe(true);
    expect(result.errors.some(e=>e.includes('streetCorners skipped'))).toBe(true);
    expect(result.reports.streetCornerGroundResult).toEqual(report);
  });
  it('includes authored source and support failures in the acceptance gate',()=>{
    expect(auditAssemblyReports({assemblyReports:{civicRoof:{status:'source-mismatch'},campStructures:{status:'no-support'}}},{}).errors).toEqual(['civicRoof: source-mismatch','campStructures: no-support']);
  });
  it('accepts completed transactions and irrelevant absent asset families',()=>{
    const result=auditAssemblyReports({assemblyReports:{terrain:{rejected:false},streetCornerGround:{rejected:false},streetCorners:{features:2,rejected:false},roadCurve:{applied:false,rejected:false}}},{terrain:{},streetCornerGround:{},streetCorners:{}});
    expect(result.errors).toEqual([]);
  });
  it('fails silent missing reports and partial source-material rejections without altering inputs',()=>{
    const data={assemblyReports:{roadMaterials:{rejectedMeshes:1}}},copy=structuredClone(data);
    expect(auditAssemblyReports(data,{roadMaterials:{},roadDash:{}}).errors).toEqual(['Registered roadDash produced no assembly report','roadMaterials rejected 1 registered meshes']);
    expect(data).toEqual(copy);
  });
});
