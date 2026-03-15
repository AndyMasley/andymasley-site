import type { BaselineInputs, HousingType, IncomeBand, UrbanForm, DietType, CarOwnership } from '@/lib/carbon/types';

const US_STATES: { code: string; name: string }[] = [
  { code: 'US', name: 'US Average' },
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' }, { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' }, { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' }, { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' }, { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' }, { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' }, { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' }, { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' }, { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
];

interface BaselineFormProps {
  value: BaselineInputs;
  onChange: (inputs: BaselineInputs) => void;
}

const FIELD_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 600,
  letterSpacing: '0.04em',
  color: 'var(--text-secondary, #6B6B60)',
};

const SELECT_STYLE: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: '0.85rem',
  fontFamily: 'inherit',
  border: '1px solid var(--divider, #DDD9D0)',
  borderRadius: '6px',
  background: 'var(--panel, #EFECE5)',
  color: 'var(--text, #1A1A18)',
  cursor: 'pointer',
  outline: 'none',
  minHeight: '44px',
};

const INPUT_STYLE: React.CSSProperties = {
  ...SELECT_STYLE,
  width: '80px',
  textAlign: 'center',
  cursor: 'text',
};

export function BaselineForm({ value, onChange }: BaselineFormProps) {
  const update = <K extends keyof BaselineInputs>(key: K, val: BaselineInputs[K]) => {
    onChange({ ...value, [key]: val });
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '1rem 1.5rem' }}>

      <div style={FIELD_STYLE}>
        <label style={LABEL_STYLE} htmlFor="cf-state">Location</label>
        <select
          id="cf-state"
          style={SELECT_STYLE}
          value={value.state}
          onChange={e => update('state', e.target.value)}
        >
          {US_STATES.map(s => (
            <option key={s.code} value={s.code}>{s.name}</option>
          ))}
        </select>
      </div>

      <div style={FIELD_STYLE}>
        <label style={LABEL_STYLE} htmlFor="cf-housing">Housing type</label>
        <select
          id="cf-housing"
          style={SELECT_STYLE}
          value={value.housingType}
          onChange={e => update('housingType', e.target.value as HousingType)}
        >
          <option value="apartment">Apartment</option>
          <option value="townhouse">Townhouse</option>
          <option value="single-family-small">House (small)</option>
          <option value="single-family-large">House (large)</option>
        </select>
      </div>

      <div style={FIELD_STYLE}>
        <label style={LABEL_STYLE} htmlFor="cf-household">Household size</label>
        <input
          id="cf-household"
          type="number"
          min={1}
          max={10}
          step={1}
          style={INPUT_STYLE}
          value={value.householdSize}
          onChange={e => update('householdSize', Math.max(1, parseFloat(e.target.value) || 1))}
        />
      </div>

      <div style={FIELD_STYLE}>
        <label style={LABEL_STYLE} htmlFor="cf-car">Car ownership</label>
        <select
          id="cf-car"
          style={SELECT_STYLE}
          value={value.carOwnership}
          onChange={e => update('carOwnership', e.target.value as CarOwnership)}
        >
          <option value="none">No car</option>
          <option value="gas">Gas car</option>
          <option value="hybrid">Hybrid</option>
          <option value="ev">Electric vehicle</option>
        </select>
      </div>

      <div style={FIELD_STYLE}>
        <label style={LABEL_STYLE} htmlFor="cf-area">Area</label>
        <select
          id="cf-area"
          style={SELECT_STYLE}
          value={value.urbanForm}
          onChange={e => update('urbanForm', e.target.value as UrbanForm)}
        >
          <option value="urban">Urban</option>
          <option value="suburban">Suburban</option>
          <option value="rural">Rural</option>
        </select>
      </div>

      <div style={FIELD_STYLE}>
        <label style={LABEL_STYLE} htmlFor="cf-diet">Diet</label>
        <select
          id="cf-diet"
          style={SELECT_STYLE}
          value={value.dietType}
          onChange={e => update('dietType', e.target.value as DietType)}
        >
          <option value="average">Average</option>
          <option value="heavy-meat">Heavy meat</option>
          <option value="light-meat">Light meat</option>
          <option value="pescatarian">Pescatarian</option>
          <option value="vegetarian">Vegetarian</option>
          <option value="vegan">Vegan</option>
        </select>
      </div>

      <div style={FIELD_STYLE}>
        <label style={LABEL_STYLE} htmlFor="cf-flights">Flights / year</label>
        <input
          id="cf-flights"
          type="number"
          min={0}
          max={100}
          step={1}
          style={INPUT_STYLE}
          value={value.flightsPerYear}
          onChange={e => update('flightsPerYear', Math.max(0, parseInt(e.target.value) || 0))}
        />
      </div>

      <div style={FIELD_STYLE}>
        <label style={LABEL_STYLE} htmlFor="cf-income">Income band</label>
        <select
          id="cf-income"
          style={SELECT_STYLE}
          value={value.incomeBand}
          onChange={e => update('incomeBand', e.target.value as IncomeBand)}
        >
          <option value="under-30k">Under $30k</option>
          <option value="30k-60k">$30k–$60k</option>
          <option value="60k-100k">$60k–$100k</option>
          <option value="100k-150k">$100k–$150k</option>
          <option value="over-150k">Over $150k</option>
        </select>
      </div>
    </div>
  );
}
