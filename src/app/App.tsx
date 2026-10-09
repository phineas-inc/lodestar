import React from 'react';
import { RouterProvider } from 'react-router';
import { router } from './routes';
import { GnssProvider } from '../gnss/GnssContext';
import { LodestarProvider } from '../lodestar/LodestarContext';

export default function App() {
  return (
    <GnssProvider>
      <LodestarProvider>
        <RouterProvider router={router} />
      </LodestarProvider>
    </GnssProvider>
  );
}
