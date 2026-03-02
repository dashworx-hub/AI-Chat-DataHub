import { Link } from 'react-router-dom';

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-gray-200/60 py-2.5 flex-shrink-0 bg-white/60">
      <div className="w-full px-6">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center gap-2">
            <span>Powered by</span>
            <Link to="/" className="flex items-center hover:opacity-70 transition-opacity">
              <img 
                src="/main_logo.png" 
                alt="Dashworx" 
                className="h-4 w-auto max-w-[80px] object-contain"
              />
            </Link>
          </div>
          <span>&copy; {currentYear} Dashworx</span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
