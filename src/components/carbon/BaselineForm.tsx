import { useState, useEffect } from 'react';
import type { BaselineInputs, HousingType, UrbanForm, DietType, CarOwnership } from '@/lib/carbon/types';

/** Number input that uses local string state so users can freely type/delete.
 *  Only commits to parent on blur or Enter. */
function NumInput({ value, onChange, min, max, step, style, id, placeholder, inputMode }: {
  value: number; onChange: (n: number) => void;
  min?: number; max?: number; step?: string | number;
  style?: React.CSSProperties; id?: string; placeholder?: string;
  inputMode?: 'numeric' | 'decimal';
}) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => { setLocal(String(value)); }, [value]);

  const commit = () => {
    const num = parseFloat(local);
    if (isNaN(num) || local.trim() === '') {
      setLocal(String(value));
    } else {
      const clamped = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, num));
      onChange(clamped);
      setLocal(String(clamped));
    }
  };

  return (
    <input
      id={id}
      type="text"
      inputMode={inputMode ?? 'numeric'}
      style={style}
      value={local}
      placeholder={placeholder}
      onChange={e => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); }}
    />
  );
}

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
  gap: '2px',
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: '0.65rem',
  fontWeight: 600,
  letterSpacing: '0.04em',
  color: 'var(--text-secondary, #6B6B60)',
};

const SELECT_STYLE: React.CSSProperties = {
  padding: '5px 8px',
  fontSize: '0.75rem',
  fontFamily: 'inherit',
  border: '1px solid var(--divider, #DDD9D0)',
  borderRadius: '5px',
  background: 'var(--bg-elevated, #ffffff)',
  color: 'var(--text, #1A1A18)',
  cursor: 'pointer',
  outline: 'none',
  minHeight: '34px',
  width: '100%',
};

const INPUT_STYLE: React.CSSProperties = {
  ...SELECT_STYLE,
  width: '100%',
  textAlign: 'center',
  cursor: 'text',
};

export function BaselineForm({ value, onChange }: BaselineFormProps) {
  const update = <K extends keyof BaselineInputs>(key: K, val: BaselineInputs[K]) => {
    onChange({ ...value, [key]: val });
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.35rem 0.5rem' }}>

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
        <label style={LABEL_STYLE} htmlFor="cf-housing">Housing</label>
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
        <label style={LABEL_STYLE} htmlFor="cf-car">Car</label>
        <select
          id="cf-car"
          style={SELECT_STYLE}
          value={value.carOwnership}
          onChange={e => {
            const car = e.target.value as CarOwnership;
            const defaultMiles: Record<string, number> = { urban: 8000, suburban: 13500, rural: 16000 };
            const updates: Partial<typeof value> = { carOwnership: car };
            if (car === 'none') {
              updates.milesPerYear = 0;
            } else if (value.carOwnership === 'none') {
              // Switching from no car to a car — restore area default
              updates.milesPerYear = defaultMiles[value.urbanForm] ?? 13500;
            }
            onChange({ ...value, ...updates });
          }}
        >
          <option value="none">No car</option>
          <option value="gas">Gas car</option>
          <option value="hybrid">Hybrid</option>
          <option value="ev">EV</option>
        </select>
      </div>

      <div style={FIELD_STYLE}>
        <label style={LABEL_STYLE} htmlFor="cf-household">Household</label>
        <NumInput
          id="cf-household"
          min={1}
          max={10}
          inputMode="decimal"
          style={INPUT_STYLE}
          value={value.householdSize}
          onChange={n => update('householdSize', n)}
        />
      </div>

      <div style={FIELD_STYLE}>
        <label style={LABEL_STYLE} htmlFor="cf-area">Area</label>
        <select
          id="cf-area"
          style={SELECT_STYLE}
          value={value.urbanForm}
          onChange={e => {
            const newForm = e.target.value as UrbanForm;
            const defaultMiles: Record<string, number> = { urban: 8000, suburban: 13500, rural: 16000 };
            const currentDefault = defaultMiles[value.urbanForm] ?? 13500;
            const updates: Partial<typeof value> = { urbanForm: newForm };
            // Auto-update miles if user hasn't customized them
            if (value.milesPerYear === currentDefault) {
              updates.milesPerYear = defaultMiles[newForm] ?? 13500;
            }
            onChange({ ...value, ...updates });
          }}
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
        <label style={LABEL_STYLE} htmlFor="cf-miles">Miles/yr</label>
        <NumInput
          id="cf-miles"
          min={0}
          max={100000}
          style={INPUT_STYLE}
          value={value.milesPerYear}
          onChange={n => update('milesPerYear', Math.round(n))}
        />
      </div>

      <div style={FIELD_STYLE}>
        <label style={LABEL_STYLE} htmlFor="cf-flights">Flights/yr</label>
        <NumInput
          id="cf-flights"
          min={0}
          max={100}
          style={INPUT_STYLE}
          value={value.flightsPerYear}
          onChange={n => {
            const newTotal = Math.round(n);
            const oldTotal = value.flightsPerYear;
            const oldTrans = value.transatlanticFlightsPerYear ?? 0;
            const oldPac = value.transpacificFlightsPerYear ?? 0;
            const oldDom = value.domesticFlightsPerYear ?? oldTotal;
            let newTrans: number, newPac: number, newDom: number;
            if (oldTotal > 0 && newTotal > 0) {
              const scale = newTotal / oldTotal;
              newTrans = Math.round(oldTrans * scale);
              newPac = Math.round(oldPac * scale);
              newDom = Math.max(newTotal - newTrans - newPac, 0);
            } else {
              newTrans = 0; newPac = 0; newDom = newTotal;
            }
            onChange({ ...value, flightsPerYear: newTotal, transatlanticFlightsPerYear: newTrans, transpacificFlightsPerYear: newPac, domesticFlightsPerYear: newDom });
          }}
        />
      </div>

      <div style={FIELD_STYLE}>
        <label style={LABEL_STYLE} htmlFor="cf-spending">Spend/mo <span style={{ fontWeight: 400, opacity: 0.7 }}>(excl. rent)</span></label>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: 'var(--text-secondary, #6B6B60)', pointerEvents: 'none' }}>$</span>
          <NumInput
            id="cf-spending"
            min={0}
            max={50000}
            style={{ ...INPUT_STYLE, paddingLeft: '18px' }}
            value={value.monthlySpending}
            placeholder="1200"
            onChange={n => update('monthlySpending', n)}
          />
        </div>
      </div>
    </div>
  );
}
