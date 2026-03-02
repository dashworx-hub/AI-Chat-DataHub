import { Link } from 'react-router-dom';

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white border-t border-gray-200 py-4 flex-shrink-0">
      <div className="w-full px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-600">
          <div className="flex items-center gap-2.5">
            <span className="font-medium">Powered by</span>
            <Link to="/" className="flex items-center hover:opacity-80 transition-opacity duration-200">
              <img 
                src="/Logo.svg" 
                alt="Dashworx Logo" 
                className="h-5 w-auto max-w-[100px] object-contain"
              />
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-medium">© {currentYear} Dashworx. All rights reserved.</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
