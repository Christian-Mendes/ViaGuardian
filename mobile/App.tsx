import React from 'react';
import { SafeAreaView, Text } from 'react-native';

const App = () => {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#1A202C', justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: '#4ADE80', fontSize: 24, fontWeight: 'bold' }}>ViaGuardian Conectado!</Text>
      <Text style={{ color: '#9CA3AF', fontSize: 16, marginTop: 10 }}>Infraestrutura Edge AI pronta para código.</Text>
    </SafeAreaView>
  );
};

export default App;
