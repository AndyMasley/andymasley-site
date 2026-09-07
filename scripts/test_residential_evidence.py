"""Pure evidence-transform tests; source ledgers are read-only fixtures."""
import copy
import importlib.util
import json
import pathlib
import re
import sys
import unittest

HERE=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('residential_evidence',HERE/'prepare-residential-evidence.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
DEPS=pathlib.Path('/private/tmp/webster-realism-v2-building/python-deps')
if DEPS.exists():sys.path.insert(0,str(DEPS))


def building(address='27 ELM ST',id='BLD-1_1',principal=True):
    return {'id':id,'structId':id.removeprefix('BLD-'),'parcelAddress':address,'principalStructureInferred':principal,
        'assessorStyle':'CONVENTIONAL','assessorStories':2,'assessorYearBuilt':1893,'footprintSourceDate':20110000,'assessorUse':'Single Family Residential'}


def chapter(address='27 Elm Street',siding='frame',color='green',quote='',sourceid='RES-TEST-01'):
    values=[sourceid,address,'1893','SF 2 stories',siding,color,'shingle','front porch','n/s','paved','n/s','level','stone','insulated',quote,'Feb 2017','[Source](https://example.test/27-Elm-St)']
    return '#### Group A: examples\n| '+' | '.join(values)+' |\n'


class ResidentialEvidenceTests(unittest.TestCase):
    def test_source_owner_fixture_uses_actual_mesh_tile_and_rejects_mismatches(self):
        manifest={'tiles':[{'id':'-12_-7','sourceIds':['168503_865839','other']},{'id':'0_0','sourceIds':['2_2']}]}
        records=[{'id':'168503_865839','tileId':'-12_-7'}]
        fixture=module.source_owner_fixture(records,manifest,'pinned-manifest-hash')
        self.assertEqual(fixture,{'version':1,'sourceManifestSha256':'pinned-manifest-hash','count':1,'owners':{'168503_865839':'-12_-7'}})
        with self.assertRaisesRegex(ValueError,'owner mismatch'):
            module.source_owner_fixture([{'id':'168503_865839','tileId':'-12_-8'}],manifest,'hash')
        with self.assertRaisesRegex(ValueError,'Duplicate residential'):
            module.source_owner_fixture(records+records,manifest,'hash')

    def test_retained_source_door_uses_node_translation_and_original_floor(self):
        doc={'nodes':[{'mesh':0,'translation':[100,0,-200]}],
             'meshes':[{'primitives':[{'material':0,'attributes':{'POSITION':0}}]}],
             'materials':[{'name':'V2 inferred | door'}],
             'accessors':[{'type':'VEC3','count':24,'min':[4.49,2.3,.015],'max':[5.51,4.38,.041]}]}
        frames=[{'start':[100,200],'tangent':[1,0],'outward':[0,-1],'width':10,'front':False}]
        original=copy.deepcopy(frames);entry=module.retained_entry(doc,frames)
        self.assertEqual(entry,{'frameIndex':0,'u':5.,'floor':2.3})
        self.assertEqual(frames,original)
        # The source door does not move to a style-driven 38%-width position.
        self.assertNotEqual(entry['u'],frames[0]['width']*.38)

    def test_missing_or_combined_source_door_never_invents_an_entry(self):
        frames=[{'start':[0,0],'tangent':[1,0],'outward':[0,-1],'width':10}]
        doc={'nodes':[{'mesh':0}], 'meshes':[{'primitives':[]}], 'materials':[], 'accessors':[]}
        self.assertIsNone(module.retained_entry(doc,frames))
        doc['materials']=[{'name':'V2 inferred | door'}]
        doc['accessors']=[{'type':'VEC3','count':48,'min':[2,1,.01],'max':[8,3,.04]}]
        doc['meshes'][0]['primitives']=[{'material':0,'attributes':{'POSITION':0}}]
        self.assertIsNone(module.retained_entry(doc,frames))

    def test_retained_door_requires_actual_wall_projection(self):
        doc={'nodes':[{'mesh':0}], 'meshes':[{'primitives':[{'material':0,'attributes':{'POSITION':0}}]}],
             'materials':[{'name':'V2 inferred | door'}],
             'accessors':[{'type':'VEC3','count':24,'min':[4.49,2.3,8.015],'max':[5.51,4.38,8.041]}]}
        self.assertIsNone(module.retained_entry(doc,[{'start':[0,0],'tangent':[1,0],'outward':[0,-1],'width':10}]))

    def test_normalization_is_precise_and_does_not_merge_similar_streets(self):
        self.assertEqual(module.norm('78 Second Island Road'),'78 2ND ISLAND RD')
        self.assertEqual(module.norm('27 Elm St (corner Myrtle)'),'27 ELM ST')
        self.assertNotEqual(module.norm('38 Park St'),module.norm('38 Park Ave'))
        self.assertNotEqual(module.norm('426 High St'),module.norm('426 High St Ext'))
        self.assertEqual(module.norm(None),'')

    def test_exact_principal_join_does_not_apply_to_accessory(self):
        register=[building(),building(id='BLD-2_2',principal=False)];before=copy.deepcopy(register)
        ledger=module.extract_ledger(chapter(),register,'fixture.md');join=ledger['records'][0]['join']
        self.assertEqual(join['principalBuildingIds'],['BLD-1_1']);self.assertEqual(join['ancillaryBuildingIds'],['BLD-2_2'])
        self.assertTrue(join['mayApplyDocumentedExteriorToUniquePrincipal']);self.assertEqual(register,before)

    def test_address_range_is_not_silently_assigned_to_endpoint(self):
        ledger=module.extract_ledger(chapter(address='76-78 North Main St'),[building('76 NORTH MAIN ST')],'fixture.md')
        join=ledger['records'][0]['join'];self.assertEqual(join['status'],'unresolved_address_range')
        self.assertFalse(join['mayApplyDocumentedExteriorToUniquePrincipal']);self.assertEqual(join['principalBuildingIds'],[])

    def test_multiple_principals_remain_ambiguous(self):
        ledger=module.extract_ledger(chapter(),[building(),building(id='BLD-2_2')],'fixture.md')
        self.assertFalse(ledger['records'][0]['join']['mayApplyDocumentedExteriorToUniquePrincipal'])

    def test_frame_and_unlocated_wood_do_not_become_cladding(self):
        for siding in ['frame','conventional 2x4/2x6','post & beam; mahogany wood','frame + stone']:
            record=module.extract_ledger(chapter(siding=siding),[building()],'fixture.md')['records'][0]
            self.assertFalse(record['documented']['exteriorMaterials']['claddingKnown'],siding)
            appearance=module.evidence_appearance(building(),{'method':'gable'},record)
            self.assertEqual(appearance['materialBasis'],'inferred')

    def test_documented_stone_accents_do_not_replace_all_vinyl_walls(self):
        record=module.extract_ledger(chapter(siding='VINYL w/ stone accents'),[building()],'fixture.md')['records'][0]
        appearance=module.evidence_appearance(building(),{'method':'gable'},record)
        self.assertEqual(appearance['material'],'siding');self.assertEqual(appearance['accentMaterial'],'stone')

    def test_listing_color_stays_dated_palette_hint(self):
        record=module.extract_ledger(chapter(),[building()],'fixture.md')['records'][0]
        self.assertFalse(record['documented']['bodyColor']['currentPaintVerified'])
        appearance=module.evidence_appearance(building(),{'method':'gable'},record)
        self.assertTrue(appearance['colorsDated']);self.assertEqual(appearance['sourceDate'],'Feb 2017')
        self.assertEqual(appearance['paintBasis'],'dated-listing-palette-hint')

    def test_two_houses_do_not_transfer_rear_cape_porch_to_three_decker(self):
        record=module.extract_ledger(chapter(address='25 Lincoln St',sourceid='RES-LINCOLN-01'),[building('25 LINCOLN ST')],'fixture.md')['records'][0]
        self.assertFalse(record['join']['mayApplyDocumentedExteriorToUniquePrincipal'])

    def test_all_130_rows_have_unique_keys_and_no_interior_claims(self):
        root=module.SOURCE/'research';source=root/'sections/residential-neighborhoods.md'
        if not source.exists():self.skipTest('Local research fixture is not present')
        text=source.read_text();register=json.loads((root/'data/building-register.json').read_text())
        ledger=module.add_exterior_quotations(module.enrich_ledger(module.extract_ledger(text,register,source),text,register),text)
        self.assertEqual(len(ledger['records']),130);self.assertEqual(len({r['recordId'] for r in ledger['records']}),130)
        self.assertEqual(len(ledger['streetProfiles']),106);self.assertEqual(len(ledger['typologies']),15)
        self.assertEqual(len(ledger['complexes']),18);self.assertEqual(len(ledger['mobileHomeClusters']),2)
        self.assertEqual(ledger['audit']['colorRecordsStated'],82)
        for record in ledger['records']:
            claims=json.dumps(record['documented']).lower()
            self.assertIsNone(re.search(r'\b(?:kitchen|interior|bedroom|bathroom|tenant|occupied|owner|sale price|workshop)\b',claims),record['recordId'])
            self.assertTrue(record['source']['sourceUrls']);self.assertGreater(record['source']['line'],200)

    def test_lower_wing_frames_never_inherit_main_eave(self):
        report={'source_world_origin':[0,0,0],'local_rotation':[[1,0],[0,1]],'bounds':{'max':[12,10,8]},
            'masses':[{'rect':[0,0,6,8],'eave_z':9,'ridge_z':11},{'rect':[6,0,12,4],'eave_z':5,'ridge_z':7}]}
        polygon=[[0,0],[12,0],[12,4],[6,4],[6,8],[0,8],[0,0]]
        frames=module.boundary_frames(polygon,report,[6,-10])
        self.assertGreaterEqual(len(frames),4);self.assertEqual(sum(f['front'] for f in frames),1)
        for frame in frames:
            mid=[frame['start'][i]+frame['tangent'][i]*frame['width']/2 for i in range(2)]
            if mid[0]>6.1:self.assertEqual(frame['eave'],5)
        self.assertTrue(any(f['eave']==9 for f in frames))

    def test_barycentric_sampler_rejects_nearby_but_outside_triangle(self):
        import numpy as np
        triangle=np.array([[[[0,0,10],[10,0,20],[0,10,30]]]],dtype=float)
        value=module.GroundSampler.contained_heights(np.array([[2,3]]),triangle)[0]
        self.assertAlmostEqual(value,18)
        outside=module.GroundSampler.contained_heights(np.array([[9,9]]),triangle)[0]
        self.assertFalse(np.isfinite(outside))

    def test_protected_and_nonprincipal_records_are_excluded(self):
        register=[building(id='BLD-protected'),building(id='BLD-accessory',principal=False)]
        records,audit=module.build_runtime_records(register,[],pathlib.Path('/nonexistent'),{'records':[]},{'protected'})
        self.assertEqual(records,[]);self.assertEqual(audit['skipped']['protected'],1)
        self.assertEqual(audit['skipped']['not_residential_principal'],1)

    def test_residential_policy_excludes_church_or_commercial_false_positive(self):
        b=building();b['assessorUse']='Church, Mosque, Synagogue, Temple, etc...';self.assertFalse(module.residential_candidate(b))
        b['assessorUse']='Single Family Residential';self.assertTrue(module.residential_candidate(b))
        b['principalStructureInferred']=False;self.assertFalse(module.residential_candidate(b))


if __name__=='__main__':unittest.main()
