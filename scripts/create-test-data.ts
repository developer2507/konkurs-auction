import mongoose from 'mongoose';
import { config } from '../src/infra/config';
import { connectDatabase } from '../src/infra/database';
import { User, IUser } from '../src/models/User';
import { AuctionService } from '../src/modules/auctions/auction.service';
import { UserService } from '../src/modules/users/user.service';

async function createTestData() {
  try {
    await connectDatabase();

    // Создаём тестовых пользователей
    console.log('Creating test users...');
    const users: IUser[] = [];
    for (let i = 0; i < 10; i++) {
      const user = await UserService.createUser({
        username: `test_user_${i}`,
        initialBalance: 100000 // 1000.00 в минимальных единицах
      });
      users.push(user);
      console.log(`Created user: ${user._id}`);
    }

    // Создаём тестовые аукционы
    console.log('\nCreating test auctions...');
    
    // Активный аукцион (начинается сразу)
    const activeAuction = await AuctionService.createAuction({
      itemId: 'test_item_1',
      itemName: 'Test Digital Gift #1',
      sellerId: users[0]._id,
      startPrice: 100,
      minStep: 10,
      startAt: new Date(),
      duration: 300, // 5 минут
      winnersPerRound: 3,
      totalRounds: 3,
      antiSnipingSeconds: 30
    });
    console.log(`Created active auction: ${activeAuction._id}`);

    // Запланированный аукцион (начнётся через минуту)
    const scheduledAuction = await AuctionService.createAuction({
      itemId: 'test_item_2',
      itemName: 'Test Digital Gift #2',
      sellerId: users[1]._id,
      startPrice: 200,
      minStep: 20,
      startAt: new Date(Date.now() + 60000), // через минуту
      duration: 600, // 10 минут
      winnersPerRound: 5,
      totalRounds: 2,
      antiSnipingSeconds: 30
    });
    console.log(`Created scheduled auction: ${scheduledAuction._id}`);

    console.log('\n✅ Test data created successfully!');
    console.log(`\nActive Auction ID: ${activeAuction._id}`);
    console.log(`Scheduled Auction ID: ${scheduledAuction._id}`);
    console.log(`\nYou can now use these IDs to test the system.`);

  } catch (error) {
    console.error('Error creating test data:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

createTestData();

