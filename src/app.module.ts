import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TradingModule } from './trading/trading.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    MongooseModule.forRoot(process.env.MONGODB_URI),
    TradingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
