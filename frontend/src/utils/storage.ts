import { v4 as uuidv4 } from 'uuid';

const adjectives = ['Funny','Blue','Loud','Crazy','Epic','Silly','Wild','Chill','Turbo','Mega','Super','Hyper','Ultra','Neon','Cosmic','Funky','Spicy','Zany','Wacky','Derpy'];
const nouns = ['Potato','Penguin','Banana','Ninja','Panda','Llama','Koala','Unicorn','Dragon','Tiger','Robot','Wizard','Pirate','Donut','Taco','Burrito','Pickle','Muffin','Noodle','Hamster'];

export function generateGuestName(): string {
  const adj = adjectives[Math.floor(Math.random()*adjectives.length)];
  const noun = nouns[Math.floor(Math.random()*nouns.length)];
  const num = Math.floor(Math.random()*90)+10;
  return `${adj}${noun}${num}`;
}

export function getOrCreateUserId(): string {
  let id = localStorage.getItem('sb_user_id');
  if (!id) {
    id = uuidv4();
    localStorage.setItem('sb_user_id', id);
  }
  return id;
}

export function getOrCreateUsername(): string {
  let name = localStorage.getItem('sb_username');
  if (!name) {
    name = generateGuestName();
    localStorage.setItem('sb_username', name);
  }
  return name;
}

export function setUsername(name: string) {
  localStorage.setItem('sb_username', name.slice(0,30));
}
