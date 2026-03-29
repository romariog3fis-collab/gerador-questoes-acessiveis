'use client';

import React from 'react';
import { motion } from 'motion/react';

const SkeletonLoader: React.FC = () => {
  return (
    <div className="space-y-8 py-4 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
          <div className="h-4 bg-slate-200 rounded-full w-3/4 mb-4" />
          <div className="h-3 bg-slate-100 rounded-full w-full mb-2" />
          <div className="h-3 bg-slate-100 rounded-full w-5/6 mb-6" />
          
          <div className="space-y-3 pl-4">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-slate-200" />
              <div className="h-3 bg-slate-100 rounded-full w-1/2" />
            </div>
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-slate-200" />
              <div className="h-3 bg-slate-100 rounded-full w-2/3" />
            </div>
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-slate-200" />
              <div className="h-3 bg-slate-100 rounded-full w-1/3" />
            </div>
          </div>
          
          <div className="mt-8 pt-6 border-t border-dashed border-slate-100 flex gap-2">
            <div className="h-8 bg-slate-200 rounded-xl w-24" />
            <div className="h-8 bg-slate-200 rounded-xl w-32" />
            <div className="h-8 bg-slate-200 rounded-xl w-28" />
          </div>
        </div>
      ))}
    </div>
  );
};

export default SkeletonLoader;
