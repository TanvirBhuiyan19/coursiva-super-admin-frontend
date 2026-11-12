import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SearchPicker, type PickerOption } from './SearchPicker';

const SCHOOLS: PickerOption[] = [
  { value: 'tn_1', label: 'Acme Academy', sub: 'acme.coursiva.app' },
  { value: 'tn_2', label: 'Bright Minds', sub: 'brightminds.coursiva.app' },
  { value: 'tn_3', label: 'Code Camp', sub: 'codecamp.coursiva.app' },
  { value: 'tn_4', label: 'Design School', sub: 'design.coursiva.app' },
];

const meta = {
  title: 'UI/SearchPicker',
  component: SearchPicker,
  args: { label: 'Find a school', query: '', onQueryChange: () => undefined, options: SCHOOLS, onPick: () => undefined },
} satisfies Meta<typeof SearchPicker>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Single pick: the caller filters server-side; here a local filter stands in for the API. */
export const Single: Story = {
  render: function Render() {
    const [query, setQuery] = useState('');
    const [picked, setPicked] = useState<PickerOption | null>(null);
    const options = SCHOOLS.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()));
    return (
      <div style={{ width: 320, minHeight: 300 }}>
        <SearchPicker
          label="Find a school"
          placeholder="Search schools…"
          query={query}
          onQueryChange={setQuery}
          options={options}
          onPick={(o) => {
            setPicked(o);
            setQuery(o.label);
          }}
        />
        <p className="t-sm muted">{picked ? `Picked ${picked.label}` : 'Nothing picked'}</p>
      </div>
    );
  },
};

/** Multi pick: chosen options are marked and announced as selected. */
export const Multi: Story = {
  render: function Render() {
    const [query, setQuery] = useState('');
    const [chosen, setChosen] = useState<string[]>(['tn_2']);
    const options = SCHOOLS.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()));
    return (
      <div style={{ width: 320, minHeight: 300 }}>
        <SearchPicker
          label="Exempt schools"
          query={query}
          onQueryChange={setQuery}
          options={options}
          isChosen={(v) => chosen.includes(v)}
          onPick={(o) => setChosen((c) => (c.includes(o.value) ? c.filter((v) => v !== o.value) : [...c, o.value]))}
        />
        <p className="t-sm muted">{chosen.length} chosen</p>
      </div>
    );
  },
};

export const Loading: Story = { args: { loading: true, options: [] } };

export const NoMatches: Story = { args: { query: 'zzz', options: [] } };
