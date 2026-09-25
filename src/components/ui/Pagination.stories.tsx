import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Pagination } from './Pagination';

const TOTAL = 112;
const PER_PAGE = 25;

const meta = {
  title: 'UI/Pagination',
  component: Pagination,
  args: { meta: { currentPage: 2, lastPage: 5, perPage: PER_PAGE, total: TOTAL, from: 26, to: 50 }, onPage: () => {}, noun: 'tenants' },
} satisfies Meta<typeof Pagination>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: function Render(args) {
    const [page, setPage] = useState(args.meta.currentPage);
    const meta = { ...args.meta, currentPage: page, from: (page - 1) * PER_PAGE + 1, to: Math.min(page * PER_PAGE, TOTAL) };
    return <Pagination {...args} meta={meta} onPage={setPage} />;
  },
};
export const SinglePage: Story = { args: { meta: { currentPage: 1, lastPage: 1, perPage: PER_PAGE, total: 9, from: 1, to: 9 } } };
