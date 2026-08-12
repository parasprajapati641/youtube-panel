import React from 'react';

const StatCard = ({ title, value, icon: Icon, color = 'red', subtitle }) => {
  const colorMap = {
    red: 'from-yt-red/20 to-transparent border-yt-red/30 text-yt-red',
    emerald: 'from-accent-emerald/20 to-transparent border-accent-emerald/30 text-accent-emerald',
    cyan: 'from-accent-cyan/20 to-transparent border-accent-cyan/30 text-accent-cyan',
    purple: 'from-accent-purple/20 to-transparent border-accent-purple/30 text-accent-purple',
    amber: 'from-accent-amber/20 to-transparent border-accent-amber/30 text-accent-amber',
  };

  return (
    <div className="glass-card glass-card-hover p-5 rounded-2xl relative overflow-hidden flex flex-col justify-between">
      <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl ${colorMap[color]} rounded-full blur-2xl opacity-40 pointer-events-none`}></div>
      
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          {title}
        </span>
        <div className={`p-2.5 rounded-xl bg-dark-800/80 border ${colorMap[color].split(' ')[1]}`}>
          <Icon className={`w-5 h-5 ${colorMap[color].split(' ')[2]}`} />
        </div>
      </div>

      <div>
        <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          {value}
        </div>
        {subtitle && (
          <p className="text-xs text-gray-400 mt-1 font-medium">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
};

export default StatCard;
