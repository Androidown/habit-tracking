import { useNavigate } from 'react-router-dom';
import RegisterForm from '../components/RegisterForm';

export default function Register() {
  const navigate = useNavigate();

  const handleSuccess = () => {
    navigate('/login');
  };

  return (
    <div className="register-page">
      <div className="register-card">
        <h1 className="register-title">创建账号</h1>
        <RegisterForm onSuccess={handleSuccess} />
      </div>
    </div>
  );
}
