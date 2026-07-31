import React from 'react';
import { useQuery } from '@tanstack/react-query';
import axiosClient from '../../core/api/axiosClient';
import { BookOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

export const CustomerRulesScreen = () => {
  const navigate = useNavigate();

  const { data: buildingProfile } = useQuery({
    queryKey: ['public-building-profile'],
    queryFn: async () => {
      try {
        const res = await axiosClient.get('/public/building-profile');
        return res.data.data;
      } catch (err) {
        return null;
      }
    }
  });

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-12 font-sans selection:bg-orange-200 pt-8">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <button 
          onClick={() => navigate(-1)}
          className="mb-8 inline-flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors font-semibold"
        >
          <ArrowLeftOutlined /> Back
        </button>

        {buildingProfile?.rules ? (
          <section className="relative mb-12">
            {/* Ambient Background */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-4xl max-h-4xl bg-orange-400/20 blur-[120px] rounded-full pointer-events-none"></div>
            
            <div className="relative z-10 bg-white/60 backdrop-blur-2xl rounded-[2.5rem] p-8 md:p-16 border border-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
              <div className="text-center mb-12">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-orange-100 to-orange-50 mb-6 shadow-inner ring-4 ring-white">
                  <BookOutlined className="text-3xl text-orange-500" />
                </div>
                <h1 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-red-500 tracking-tight">
                  Parking Rules
                </h1>
                <p className="text-slate-500 font-medium mt-4 text-lg max-w-2xl mx-auto">Please comply with the rules below to ensure safety and order for {buildingProfile.name || 'the parking lot'}.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {buildingProfile.rules.split('\n').filter((r:string) => r.trim()).map((item: string, index: number) => (
                    <div key={index} className="group relative bg-white/70 backdrop-blur-md rounded-2xl p-8 border border-white/60 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
                        {/* Watermark Number */}
                        <div className="absolute -right-4 -bottom-6 text-9xl font-black text-slate-900/[0.03] select-none pointer-events-none group-hover:text-orange-500/[0.05] transition-colors duration-500">
                          {index + 1}
                        </div>
                        <div className="relative z-10 flex items-start gap-5">
                            <span className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-red-500 text-white flex items-center justify-center text-base font-bold shrink-0 shadow-md ring-2 ring-white">
                                {index + 1}
                            </span> 
                            <span className="text-slate-700 font-medium leading-relaxed text-lg">{item}</span>
                        </div>
                    </div>
                ))}
              </div>
            </div>
          </section>
        ) : (
          <div className="text-center py-20 text-slate-500 italic bg-white/50 backdrop-blur-md rounded-3xl border border-white">
            There are currently no rules established.
          </div>
        )}
      </main>
    </div>
  );
};
