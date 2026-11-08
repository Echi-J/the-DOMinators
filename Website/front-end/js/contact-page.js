
window.AccessContactPage = class extends DCLogic {
renderVals() {
const S = this.state;
const topic = S.topic || 'place';
const T = [
['place', 'A place’s info is wrong', 'M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11zM12 10h.01'],
['site', 'Something on this site is hard to use', 'M3 4h18v12H3zM8 20h8M12 16v4'],
['partner', 'I run a venue or work for a council', 'M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6'],
['other', 'Something else', 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 8v5M12 16h.01']
];
const msg = S.msg || '';
const err = !!S.tried && !msg.trim();
return {
goMap: () => { try { localStorage.setItem('al-mode', 'map'); } catch (e) {} },
topics: T.map((t) => ({ label: t[1], icon: t[2], pressed: topic === t[0] ? 'true' : 'false',
bg: topic === t[0] ? '#DCE7C4' : '#F2F3DC', border: topic === t[0] ? '2px solid #2F6B3C' : '2px solid #D3D4B8',
iconBg: topic === t[0] ? '#2F6B3C' : '#E3E6C4', iconFg: topic === t[0] ? '#F2F3DC' : '#4B4C3D',
pick: () => this.setState({ topic: t[0] }) })),
isPlace: topic === 'place', place: S.place || '', onPlace: (e) => this.setState({ place: e.target.value }),
email: S.email || '', onEmail: e => this.setState({email:e.target.value}), formError: S.formError || '',
msg: msg, onMsg: (e) => this.setState({ msg: e.target.value }),
showErr: err, msgInvalid: err ? 'true' : 'false', msgBorder: err ? '#8A3B1C' : '#C9C9AE',
send: () => {
if (!msg.trim()) return this.setState({tried:true});
const email = (S.email || '').trim();
if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return this.setState({formError:'Enter a valid email or leave it blank.'});
AccessData.download('access-london-contact-draft.json', { topic, place: S.place || '', message: msg.trim(), email, created_at: new Date().toISOString(), delivery_status: 'not_sent' });
this.setState({ sent: true, tried: false, formError: null });
},
sent: !!S.sent, notSent: !S.sent,
reset: () => this.setState({ sent: false, msg: '', place: '', email: '', formError: null })
};
}
}
