import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { AuctionList } from './components/AuctionList';
import { AuctionDetail } from './components/AuctionDetail';
import { Balance } from './components/Balance';
import { CreateAuction } from './components/CreateAuction';

function App() {

  return (
    <BrowserRouter>
      <div className="container">
        <div className="header">
          <h1>Telegram Gift Auctions</h1>
          <nav style={{ marginTop: '20px' }}>
            <Link to="/" style={{ marginRight: '20px', textDecoration: 'none', color: '#007bff' }}>
              Auctions
            </Link>
            <Link to="/create" style={{ marginRight: '20px', textDecoration: 'none', color: '#007bff' }}>
              Create
            </Link>
            <Link to="/balance" style={{ textDecoration: 'none', color: '#007bff' }}>
              Balance
            </Link>
          </nav>
        </div>

        <Routes>
          <Route path="/" element={<AuctionList />} />
          <Route path="/auction/:id" element={<AuctionDetail />} />
          <Route path="/create" element={<CreateAuction />} />
          <Route path="/balance" element={<Balance />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;

