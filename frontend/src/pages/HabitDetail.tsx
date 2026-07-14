import { useParams } from 'react-router-dom';
import RecentRecordsList from '../components/habit-detail/RecentRecordsList';

export default function HabitDetail() {
  const { habitId } = useParams<{ habitId: string }>();

  if (!habitId) {
    return (
      <div className="habit-detail">
        <p className="habit-detail__error">习惯 ID 无效</p>
      </div>
    );
  }

  return (
    <div className="habit-detail">
      <h1 className="habit-detail__title">习惯详情</h1>
      <RecentRecordsList habitId={habitId} />
    </div>
  );
}
